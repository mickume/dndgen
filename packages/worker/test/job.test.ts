import { describe, expect, it } from "vitest";
import { keys } from "../src/env.ts";
import { assembleJob, prepareImage, resolver } from "../src/job.ts";
import { fakeEnv } from "./fakes.ts";

const ID = "00000000-0000-0000-0000-000000000001";

describe("assembleJob", () => {
  it("assembles an uploaded lorewright campaign", async () => {
    const { env, JOBS } = fakeEnv();
    await JOBS.put(
      keys.source(ID, "campaign-overview.md"),
      "# Hollow Hill\n\n**System:** D&D 5e\n",
    );
    await JOBS.put(
      keys.source(ID, "chapter-01.md"),
      "# Chapter 1: In\n\n![Gate](art/scenes/images/gate.jpg)\n",
    );
    await JOBS.put(keys.source(ID, "art/scenes/images/gate.jpg"), "jpeg");
    await JOBS.put(keys.source(ID, "art/scenes/gate.md"), "---\ntitle: gate\n---\nprompt");

    const result = await assembleJob(env, ID);
    expect(result).toEqual({
      title: "Hollow Hill",
      assets: ["art/scenes/images/gate.jpg"],
      warnings: [],
    });
    expect(JOBS.text(keys.adventure(ID))).toContain("# Chapter 1: In {#chapter-01}");
  });

  it("takes an uploaded adventure.md as it is and notes missing images", async () => {
    const { env, JOBS } = fakeEnv();
    const markdown = "---\ntitle: Ready Made\n---\n# One\n\n![A](a.jpg)\n\n![B](b.jpg)\n";
    await JOBS.put(keys.source(ID, "adventure.md"), markdown);
    await JOBS.put(keys.source(ID, "a.jpg"), "jpeg");

    const result = await assembleJob(env, ID);
    expect(result).toEqual({
      title: "Ready Made",
      assets: ["a.jpg"],
      warnings: ["image b.jpg was not uploaded"],
    });
    expect(JOBS.text(keys.adventure(ID))).toBe(markdown);
  });

  it("fails when there is nothing to render", async () => {
    const { env, JOBS } = fakeEnv();
    await JOBS.put(keys.source(ID, "one.md"), "# One");
    await JOBS.put(keys.source(ID, "two.md"), "# Two");
    await expect(assembleJob(env, ID)).rejects.toThrow(/adventure\.md/);
  });
});

describe("prepareImage", () => {
  function images(behaviour: "ok" | "fail") {
    const calls: unknown[] = [];
    const binding = {
      input: () => ({
        transform(options: unknown) {
          calls.push(options);
          return this;
        },
        async output(options: { format: string }) {
          if (behaviour === "fail") throw new Error("unsupported");
          return { image: () => new Response("small").body, contentType: () => options.format };
        },
      }),
    };
    return { binding, calls };
  }

  it("stores a scaled-down copy for print", async () => {
    const { binding, calls } = images("ok");
    const { env, JOBS } = fakeEnv({ IMAGES: binding });
    await JOBS.put(keys.source(ID, "art/a.png"), "big");
    expect(await prepareImage(env, ID, "art/a.png")).toBeNull();
    expect(calls).toEqual([{ width: 1800, height: 1800, fit: "scale-down" }]);
    expect(JOBS.text(keys.print(ID, "art/a.png"))).toBe("small");
    expect(JOBS.objects.get(keys.print(ID, "art/a.png"))?.contentType).toBe("image/png");
  });

  it("falls back to the original with a warning", async () => {
    const { binding } = images("fail");
    const { env, JOBS } = fakeEnv({ IMAGES: binding });
    await JOBS.put(keys.source(ID, "art/a.jpg"), "big");
    expect(await prepareImage(env, ID, "art/a.jpg")).toBe(
      "image art/a.jpg was printed at full size: unsupported",
    );
    expect(JOBS.objects.has(keys.print(ID, "art/a.jpg"))).toBe(false);
  });

  it("leaves formats it cannot resize alone", async () => {
    const { env } = fakeEnv();
    expect(await prepareImage(env, ID, "art/map.svg")).toBeNull();
  });
});

describe("resolver", () => {
  it("serves theme assets, then prepared images, then originals", async () => {
    const { env, JOBS } = fakeEnv();
    await JOBS.put(keys.source(ID, "art/a.jpg"), "original");
    await JOBS.put(keys.source(ID, "art/b.jpg"), "original");
    await JOBS.put(keys.print(ID, "art/b.jpg"), "prepared", {
      httpMetadata: { contentType: "image/jpeg" },
    });
    const resolve = resolver(env, ID);

    expect(await (await resolve("assets/themes/dndbeyond/theme.css"))?.text()).toBe("asset");
    expect(await (await resolve("doc/art/a.jpg"))?.text()).toBe("original");
    expect((await resolve("doc/art/a.jpg"))?.headers.get("content-type")).toBe("image/jpeg");
    expect(await (await resolve("doc/art/b.jpg"))?.text()).toBe("prepared");
    expect(await resolve("doc/art/none.jpg")).toBeUndefined();
    expect(await resolve("elsewhere")).toBeUndefined();
  });
});
