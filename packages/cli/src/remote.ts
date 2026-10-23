import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

export interface RemoteRender {
  /** The Adventure Markdown to render. */
  markdown: string;
  /** Directory the image paths are relative to. */
  root: string;
  /** Image paths to upload with it. */
  assets: string[];
  /** Base URL of a dndgen Worker. */
  endpoint: string;
  token: string | undefined;
  /** Where to write the PDF. */
  output: string;
  log: (line: string) => void;
  /** Milliseconds between status checks. */
  pollInterval?: number;
  /** The fetch to talk to the Worker with; tests pass their own. */
  fetch?: typeof fetch;
}

interface JobState {
  id: string;
  status: "uploading" | "queued" | "rendering" | "done" | "failed";
  error?: string;
  pdf?: string;
  report?: { pages: number; bytes: number; warnings: string[] };
}

const UPLOADS_IN_FLIGHT = 4;

/** Uploads an adventure to a dndgen Worker, waits for the render and saves the PDF. */
export async function renderRemote(job: RemoteRender): Promise<void> {
  if (!job.token) throw new Error("an API token is required: pass --token or set DNDGEN_TOKEN");
  const base = job.endpoint.replace(/\/+$/, "");
  const call = caller(job.fetch ?? fetch);
  const auth = { authorization: `Bearer ${job.token}` };

  const created = await call<{ id: string }>(`${base}/v1/jobs`, { method: "POST", headers: auth });
  const id = created.id;
  job.log(`job ${id}`);

  const files: Array<{ path: string; load: () => Promise<Uint8Array<ArrayBuffer>> }> = [
    { path: "adventure.md", load: async () => new TextEncoder().encode(job.markdown) },
    ...job.assets.map((path) => ({ path, load: () => readFile(join(job.root, path)) })),
  ];
  let uploaded = 0;
  const queue = [...files];
  await Promise.all(
    Array.from({ length: UPLOADS_IN_FLIGHT }, async () => {
      for (let file = queue.shift(); file; file = queue.shift()) {
        const body = await file.load();
        const url = `${base}/v1/jobs/${id}/files/${file.path.split("/").map(encodeURIComponent).join("/")}`;
        await call(url, {
          method: "PUT",
          headers: { ...auth, "content-type": "application/octet-stream" },
          body,
        });
        uploaded++;
        job.log(`uploaded ${uploaded}/${files.length} ${file.path}`);
      }
    }),
  );

  await call(`${base}/v1/jobs/${id}/render`, { method: "POST", headers: auth });
  let last = "";
  for (;;) {
    const state = await call<JobState>(`${base}/v1/jobs/${id}`, {});
    if (state.status !== last) job.log(state.status);
    last = state.status;
    if (state.status === "failed")
      throw new Error(`render failed: ${state.error ?? "unknown error"}`);
    if (state.status === "done") {
      const response = await (job.fetch ?? fetch)(
        state.pdf ?? `${base}/v1/jobs/${id}/adventure.pdf`,
      );
      if (!response.ok) throw new Error(`downloading the PDF failed: ${response.status}`);
      await writeFile(job.output, new Uint8Array(await response.arrayBuffer()));
      for (const warning of state.report?.warnings ?? []) job.log(`warning: ${warning}`);
      job.log(`wrote ${job.output} (${state.report?.pages ?? "?"} pages)`);
      return;
    }
    await sleep(job.pollInterval ?? 3000);
  }
}

/** A JSON call that turns error responses into exceptions carrying the Worker's message. */
function caller(fetcher: typeof fetch) {
  return async <T = unknown>(url: string, init: RequestInit): Promise<T> => {
    const response = await fetcher(url, init);
    if (!response.ok) {
      const text = await response.text();
      let message = text;
      try {
        message = (JSON.parse(text) as { error?: string }).error ?? text;
      } catch {}
      throw new Error(`${init.method ?? "GET"} ${url}: ${response.status} ${message}`);
    }
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  };
}
