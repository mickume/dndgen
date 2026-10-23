import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { loadCampaign } from "../src/files.ts";
import { main } from "../src/main.ts";
import { renderRemote } from "../src/remote.ts";

let dir: string;

async function write(path: string, text: string): Promise<void> {
  await mkdir(dirname(join(dir, path)), { recursive: true });
  await writeFile(join(dir, path), text);
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "dndgen-cli-"));
  await write("camp/campaign-overview.md", "# Hollow Hill\n\n**System:** D&D 5e\n");
  await write("camp/chapter-01.md", "# Chapter 1: In\n\n![Gate](art/scenes/images/gate.jpg)\n");
  await write("camp/art/scenes/images/gate.jpg", "jpeg");
  await write("camp/art/scenes/gate.md", "---\ntitle: gate\n---\n");
  await write("camp/art/scenes/gate/takes/001.jpg", "take");
  await write("camp/.git/HEAD", "ref");
});

describe("loadCampaign", () => {
  it("reads markdown outside art/ as documents and lists everything else as assets", async () => {
    const source = await loadCampaign(join(dir, "camp"));
    expect([...source.documents.keys()].sort()).toEqual(["campaign-overview.md", "chapter-01.md"]);
    expect([...source.assets].sort()).toEqual(["art/scenes/gate.md", "art/scenes/images/gate.jpg"]);
  });
});

describe("dndgen", () => {
  it("assembles a campaign into one file", async () => {
    const output = join(dir, "out.md");
    expect(await main(["assemble", join(dir, "camp"), "-o", output])).toBe(0);
    const markdown = await readFile(output, "utf8");
    expect(markdown).toContain("title: Hollow Hill");
    expect(markdown).toContain("{{figure,scene\n![Gate](art/scenes/images/gate.jpg)\n}}");
  });

  it("writes a preview that loads the theme from disk", async () => {
    const output = join(dir, "out.html");
    expect(await main(["preview", join(dir, "camp"), "-o", output])).toBe(0);
    const html = await readFile(output, "utf8");
    expect(html).toContain(`<base href="file://${join(dir, "camp")}/">`);
    expect(html).toMatch(
      /href="file:\/\/[^"]+\/packages\/core\/assets\/themes\/dndbeyond\/theme\.css"/,
    );
  });

  it("explains its usage", async () => {
    expect(await main(["--help"])).toBe(0);
    expect(await main([])).toBe(2);
    expect(await main(["assemble"])).toBe(2);
    expect(await main(["frobnicate", "x"])).toBe(2);
  });
});

describe("renderRemote", () => {
  const BASE = "http://worker.test";
  let requests: Array<{ method: string; url: string; auth: string | null; body: string }>;
  let polls: number;

  /** Plays the Worker: answers the job protocol in memory. */
  const worker: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url).pathname;
    requests.push({
      method: request.method,
      url,
      auth: request.headers.get("authorization"),
      body: await request.text(),
    });
    const json = (status: number, body: unknown) => Response.json(body, { status });
    if (request.method === "POST" && url === "/v1/jobs") return json(201, { id: "job-1" });
    if (request.method === "PUT") return new Response(null, { status: 204 });
    if (url === "/v1/jobs/job-1/render") return json(202, { id: "job-1", status: "queued" });
    if (url === "/v1/jobs/job-1") {
      polls++;
      return polls < 2
        ? json(200, { id: "job-1", status: "rendering" })
        : json(200, {
            id: "job-1",
            status: "done",
            pdf: `${BASE}/v1/jobs/job-1/adventure.pdf`,
            report: { pages: 7, bytes: 4, warnings: ["w"] },
          });
    }
    if (url === "/v1/jobs/job-1/adventure.pdf") return new Response("%PDF");
    return json(404, { error: "no such job" });
  };

  beforeEach(() => {
    requests = [];
    polls = 0;
  });

  it("uploads the adventure and its images, starts the render, waits and saves the PDF", async () => {
    const output = join(dir, "book.pdf");
    const log: string[] = [];
    await renderRemote({
      markdown: "# A",
      root: join(dir, "camp"),
      assets: ["art/scenes/images/gate.jpg"],
      endpoint: `${BASE}/`,
      token: "t0ken",
      output,
      log: (line) => log.push(line),
      pollInterval: 1,
      fetch: worker,
    });
    expect(await readFile(output, "utf8")).toBe("%PDF");
    const writes = requests.filter((r) => r.method !== "GET");
    expect(writes.map((r) => `${r.method} ${r.url}`)).toEqual([
      "POST /v1/jobs",
      "PUT /v1/jobs/job-1/files/adventure.md",
      "PUT /v1/jobs/job-1/files/art/scenes/images/gate.jpg",
      "POST /v1/jobs/job-1/render",
    ]);
    expect(writes.every((r) => r.auth === "Bearer t0ken")).toBe(true);
    expect(writes[1]?.body).toBe("# A");
    expect(writes[2]?.body).toBe("jpeg");
    expect(log).toContain("warning: w");
    expect(log.at(-1)).toBe(`wrote ${output} (7 pages)`);
  });

  it("reports the Worker's error message", async () => {
    const failing: typeof fetch = async () =>
      Response.json({ error: "API_TOKEN is not configured" }, { status: 503 });
    await expect(
      renderRemote({
        markdown: "",
        root: dir,
        assets: [],
        endpoint: BASE,
        token: "t",
        output: "x",
        log: () => {},
        fetch: failing,
      }),
    ).rejects.toThrow("POST http://worker.test/v1/jobs: 503 API_TOKEN is not configured");
  });

  it("needs a token", async () => {
    await expect(
      renderRemote({
        markdown: "",
        root: dir,
        assets: [],
        endpoint: BASE,
        token: undefined,
        output: "x",
        log: () => {},
      }),
    ).rejects.toThrow(/API token/);
  });
});
