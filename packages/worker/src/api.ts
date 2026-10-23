import { renderHtml } from "@dndgen/core";
import { Hono, type MiddlewareHandler } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { HTTPException } from "hono/http-exception";
import { type Env, type JobReport, keys } from "./env.ts";
import { contentType } from "./job.ts";

/** Largest single file a job accepts. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
const JOB_ID = /^[0-9a-f-]{36}$/;

export type JobStatus = "uploading" | "queued" | "rendering" | "done" | "failed";

type App = { Bindings: Env };

/** Writes need the API token; reads only need the job id, which is unguessable. */
const requireToken: MiddlewareHandler<App> = async (c, next) => {
  const token = c.env.API_TOKEN;
  if (!token) return c.json({ error: "API_TOKEN is not configured on this Worker" }, 503);
  const auth = bearerAuth({ token }) as MiddlewareHandler<App>;
  return auth(c, next);
};

export const api = new Hono<App>().basePath("/v1");

api.onError((error, c) => {
  if (error instanceof HTTPException) return error.getResponse();
  console.error(error);
  return c.json({ error: error.message }, 500);
});

api.get("/health", (c) => c.json({ ok: true }));

api.post("/jobs", requireToken, async (c) => {
  const id = crypto.randomUUID();
  await c.env.JOBS.put(keys.job(id), JSON.stringify({ id, createdAt: new Date().toISOString() }), {
    httpMetadata: { contentType: "application/json" },
  });
  return c.json({ id, status: "uploading" satisfies JobStatus }, 201);
});

api.use("/jobs/:id/*", async (c, next) => {
  const id = c.req.param("id");
  if (!id || !JOB_ID.test(id) || !(await c.env.JOBS.head(keys.job(id))))
    return c.json({ error: "no such job" }, 404);
  return next();
});

api.put("/jobs/:id/files/*", requireToken, async (c) => {
  const id = c.req.param("id");
  const path = filePath(c.req.path, id);
  if (!path) return c.json({ error: "invalid file path" }, 400);
  const length = Number(c.req.header("content-length"));
  if (!Number.isFinite(length) || length <= 0)
    return c.json({ error: "Content-Length is required" }, 411);
  if (length > MAX_FILE_BYTES)
    return c.json({ error: `files are limited to ${MAX_FILE_BYTES} bytes` }, 413);
  if (await renderStarted(c.env, id)) return c.json({ error: "the job is already rendering" }, 409);
  const body = c.req.raw.body;
  if (!body) return c.json({ error: "empty body" }, 400);
  await c.env.JOBS.put(keys.source(id, path), body, {
    httpMetadata: { contentType: contentType(path) },
  });
  return c.body(null, 204);
});

api.post("/jobs/:id/render", requireToken, async (c) => {
  const id = c.req.param("id");
  if (await renderStarted(c.env, id)) return c.json({ error: "the job is already rendering" }, 409);
  await c.env.RENDER.create({ id, params: { jobId: id } });
  return c.json({ id, status: "queued" satisfies JobStatus }, 202);
});

api.get("/jobs/:id", async (c) => {
  const id = c.req.param("id");
  const base = new URL(`/v1/jobs/${id}`, c.req.url).href;
  const instance = await c.env.RENDER.get(id).catch(() => undefined);
  if (!instance) return c.json({ id, status: "uploading" satisfies JobStatus });
  const state = await instance.status();
  const status = jobStatus(state.status);
  const body: Record<string, unknown> = { id, status };
  if (status === "failed") body.error = state.error?.message ?? state.status;
  if (status === "done") {
    body.report = state.output as JobReport;
    body.pdf = `${base}/adventure.pdf`;
  }
  if (status === "rendering" || status === "done") {
    body.markdown = `${base}/adventure.md`;
    body.preview = `${base}/preview`;
  }
  return c.json(body);
});

api.get("/jobs/:id/adventure.pdf", async (c) => {
  const id = c.req.param("id");
  const object = await c.env.JOBS.get(keys.pdf(id));
  if (!object) return c.json({ error: "the PDF is not ready" }, 404);
  const report = await c.env.JOBS.get(keys.report(id));
  const title = report ? ((await report.json()) as JobReport).title : "adventure";
  return new Response(object.body, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${fileName(title)}.pdf"`,
    },
  });
});

api.get("/jobs/:id/adventure.md", async (c) => {
  const object = await c.env.JOBS.get(keys.adventure(c.req.param("id")));
  if (!object) return c.json({ error: "adventure.md is not ready" }, 404);
  return new Response(object.body, { headers: { "content-type": "text/markdown; charset=utf-8" } });
});

/** The print page as HTML, for looking at a job in a browser. */
api.get("/jobs/:id/preview", async (c) => {
  const id = c.req.param("id");
  const object = await c.env.JOBS.get(keys.adventure(id));
  if (!object) return c.json({ error: "adventure.md is not ready" }, 404);
  const { html } = renderHtml(await object.text(), {
    baseUrl: new URL(`/v1/jobs/${id}/files/`, c.req.url).href,
    assetUrl: new URL("/", c.req.url).href,
  });
  return c.html(html);
});

api.get("/jobs/:id/files/*", async (c) => {
  const id = c.req.param("id");
  const path = filePath(c.req.path, id);
  if (!path) return c.json({ error: "invalid file path" }, 400);
  const object =
    (await c.env.JOBS.get(keys.print(id, path))) ?? (await c.env.JOBS.get(keys.source(id, path)));
  if (!object) return c.json({ error: "no such file" }, 404);
  return new Response(object.body, {
    headers: { "content-type": object.httpMetadata?.contentType ?? contentType(path) },
  });
});

/** The campaign-relative path of a files/ URL, or undefined when it is not a safe one. */
export function filePath(requestPath: string, id: string): string | undefined {
  const raw = requestPath.slice(`/v1/jobs/${id}/files/`.length);
  let path: string;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return undefined;
  }
  const parts = path.split("/");
  if (
    !path ||
    path.length > 512 ||
    parts.some((part) => part === "" || part === "." || part === "..")
  )
    return undefined;
  if (/[\p{Cc}\\]/u.test(path)) return undefined;
  return path;
}

async function renderStarted(env: Env, id: string): Promise<boolean> {
  return (await env.RENDER.get(id).catch(() => undefined)) !== undefined;
}

export function jobStatus(status: InstanceStatus["status"]): JobStatus {
  switch (status) {
    case "complete":
      return "done";
    case "errored":
    case "terminated":
      return "failed";
    case "queued":
      return "queued";
    default:
      return "rendering";
  }
}

function fileName(title: string): string {
  return (
    title
      .replace(/[^\p{L}\p{N} _-]+/gu, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase() || "adventure"
  );
}
