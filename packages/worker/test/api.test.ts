import { describe, expect, it } from "vitest";
import { api, filePath, jobStatus, MAX_FILE_BYTES } from "../src/api.ts";
import { keys } from "../src/env.ts";
import { fakeEnv } from "./fakes.ts";

const AUTH = { authorization: "Bearer secret" };

function request(env: ReturnType<typeof fakeEnv>["env"], path: string, init: RequestInit = {}) {
  return api.request(`http://dndgen.test${path}`, init, env);
}

async function createJob(env: ReturnType<typeof fakeEnv>["env"]): Promise<string> {
  const response = await request(env, "/v1/jobs", { method: "POST", headers: AUTH });
  expect(response.status).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

function upload(env: ReturnType<typeof fakeEnv>["env"], id: string, path: string, body: string) {
  return request(env, `/v1/jobs/${id}/files/${path}`, {
    method: "PUT",
    headers: { ...AUTH, "content-length": String(body.length) },
    body,
  });
}

describe("API", () => {
  it("needs the token for writes", async () => {
    const { env } = fakeEnv();
    expect((await request(env, "/v1/jobs", { method: "POST" })).status).toBe(401);
    expect(
      (
        await request(env, "/v1/jobs", {
          method: "POST",
          headers: { authorization: "Bearer wrong" },
        })
      ).status,
    ).toBe(401);
  });

  it("refuses writes when no token is configured", async () => {
    const { env } = fakeEnv({ API_TOKEN: undefined });
    expect((await request(env, "/v1/jobs", { method: "POST", headers: AUTH })).status).toBe(503);
  });

  it("stores uploaded files under the job", async () => {
    const { env, JOBS } = fakeEnv();
    const id = await createJob(env);
    expect((await upload(env, id, "art/scenes/images/a%20b.jpg", "jpeg")).status).toBe(204);
    expect(JOBS.text(keys.source(id, "art/scenes/images/a b.jpg"))).toBe("jpeg");
    expect(JOBS.objects.get(keys.source(id, "art/scenes/images/a b.jpg"))?.contentType).toBe(
      "image/jpeg",
    );
  });

  it("rejects unsafe paths and oversized files", async () => {
    const { env } = fakeEnv();
    const id = await createJob(env);
    expect((await upload(env, id, "art%2F..%2Fsecret", "x")).status).toBe(400);
    const put = (headers: Record<string, string>) =>
      request(env, `/v1/jobs/${id}/files/a.md`, {
        method: "PUT",
        headers: { ...AUTH, ...headers },
        body: "x",
      });
    expect((await put({ "content-length": String(MAX_FILE_BYTES + 1) })).status).toBe(413);
  });

  it("answers 404 for jobs that do not exist", async () => {
    const { env } = fakeEnv();
    expect((await request(env, "/v1/jobs/00000000-0000-0000-0000-000000000000")).status).toBe(404);
    expect((await request(env, "/v1/jobs/nope/adventure.pdf")).status).toBe(404);
  });

  it("reports a job's life from upload to PDF", async () => {
    const { env, JOBS, RENDER } = fakeEnv();
    const id = await createJob(env);
    const status = async () =>
      (await (await request(env, `/v1/jobs/${id}`)).json()) as Record<string, unknown>;
    expect(await status()).toEqual({ id, status: "uploading" });

    expect(
      (await request(env, `/v1/jobs/${id}/render`, { method: "POST", headers: AUTH })).status,
    ).toBe(202);
    expect(RENDER.instances.get(id)?.params).toEqual({ jobId: id });
    expect((await status()).status).toBe("queued");
    expect(
      (await request(env, `/v1/jobs/${id}/render`, { method: "POST", headers: AUTH })).status,
    ).toBe(409);
    expect((await upload(env, id, "late.md", "x")).status).toBe(409);
    expect((await request(env, `/v1/jobs/${id}/adventure.pdf`)).status).toBe(404);

    const report = { title: "The Lantern Thief", pages: 3, bytes: 3, warnings: [] };
    (RENDER.instances.get(id) as { status: InstanceStatus }).status = {
      status: "complete",
      output: report,
    };
    await JOBS.put(keys.pdf(id), "%PDF");
    await JOBS.put(keys.report(id), JSON.stringify(report));
    expect(await status()).toEqual({
      id,
      status: "done",
      report,
      pdf: `http://dndgen.test/v1/jobs/${id}/adventure.pdf`,
      markdown: `http://dndgen.test/v1/jobs/${id}/adventure.md`,
      preview: `http://dndgen.test/v1/jobs/${id}/preview`,
    });
    const pdf = await request(env, `/v1/jobs/${id}/adventure.pdf`);
    expect(pdf.headers.get("content-disposition")).toBe(
      'attachment; filename="the-lantern-thief.pdf"',
    );
    expect(await pdf.text()).toBe("%PDF");
  });

  it("reports failures with their message", async () => {
    const { env, RENDER } = fakeEnv();
    const id = await createJob(env);
    await request(env, `/v1/jobs/${id}/render`, { method: "POST", headers: AUTH });
    (RENDER.instances.get(id) as { status: InstanceStatus }).status = {
      status: "errored",
      error: { name: "Error", message: "no campaign" },
    };
    expect(await (await request(env, `/v1/jobs/${id}`)).json()).toEqual({
      id,
      status: "failed",
      error: "no campaign",
    });
  });

  it("previews a job with links back to its files and the theme", async () => {
    const { env, JOBS } = fakeEnv();
    const id = await createJob(env);
    await JOBS.put(keys.adventure(id), "---\ntitle: T\n---\n# One\n\n![A](art/a.jpg)\n");
    await JOBS.put(keys.source(id, "art/a.jpg"), "jpeg");
    const html = await (await request(env, `/v1/jobs/${id}/preview`)).text();
    expect(html).toContain(`<base href="http://dndgen.test/v1/jobs/${id}/files/">`);
    expect(html).toContain('href="http://dndgen.test/themes/dndbeyond/theme.css"');
    expect(await (await request(env, `/v1/jobs/${id}/files/art/a.jpg`)).text()).toBe("jpeg");
  });
});

describe("filePath", () => {
  const id = "00000000-0000-0000-0000-000000000000";
  const path = (p: string) => filePath(`/v1/jobs/${id}/files/${p}`, id);

  it("decodes campaign-relative paths", () => {
    expect(path("art/scenes/images/x%20y.jpg")).toBe("art/scenes/images/x y.jpg");
  });

  it("refuses traversal, empty segments and control characters", () => {
    for (const bad of [
      "",
      "../x",
      "a/../b",
      "a//b",
      "a/./b",
      "%2e%2e/x",
      "a%00b",
      "a\\b",
      "%E0%A4%A",
    ]) {
      expect(path(bad), bad).toBeUndefined();
    }
  });
});

describe("jobStatus", () => {
  it("maps workflow states", () => {
    expect(jobStatus("complete")).toBe("done");
    expect(jobStatus("errored")).toBe("failed");
    expect(jobStatus("terminated")).toBe("failed");
    expect(jobStatus("queued")).toBe("queued");
    expect(jobStatus("running")).toBe("rendering");
    expect(jobStatus("waiting")).toBe("rendering");
  });
});
