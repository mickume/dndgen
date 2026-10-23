import type { Env } from "../src/env.ts";

type Body = string | ArrayBuffer | ArrayBufferView | ReadableStream | Blob | null;

interface Stored {
  bytes: Uint8Array;
  contentType: string | undefined;
}

/** Just enough of an R2 bucket for the Worker's code paths. */
export class FakeBucket {
  readonly objects = new Map<string, Stored>();

  async put(key: string, value: Body, options?: R2PutOptions): Promise<void> {
    const bytes = new Uint8Array(await new Response(value).arrayBuffer());
    const meta = options?.httpMetadata;
    const contentType =
      meta instanceof Headers ? (meta.get("content-type") ?? undefined) : meta?.contentType;
    this.objects.set(key, { bytes, contentType });
  }

  async get(key: string) {
    const stored = this.objects.get(key);
    if (!stored) return null;
    return {
      key,
      body: new Response(stored.bytes).body,
      httpMetadata: { contentType: stored.contentType },
      text: async () => new TextDecoder().decode(stored.bytes),
      json: async () => JSON.parse(new TextDecoder().decode(stored.bytes)),
      arrayBuffer: async () => stored.bytes.slice().buffer,
    };
  }

  async head(key: string) {
    return this.objects.has(key) ? { key } : null;
  }

  async list(options: { prefix?: string; cursor?: string }) {
    const keys = [...this.objects.keys()]
      .filter((key) => key.startsWith(options.prefix ?? ""))
      .sort();
    const start = Number(options.cursor ?? 0);
    const page = keys.slice(start, start + 2);
    const truncated = start + 2 < keys.length;
    return {
      objects: page.map((key) => ({ key })),
      truncated,
      cursor: truncated ? String(start + 2) : undefined,
    };
  }

  text(key: string): string | undefined {
    const stored = this.objects.get(key);
    return stored ? new TextDecoder().decode(stored.bytes) : undefined;
  }
}

/** A Workflow binding whose instances report whatever status a test sets. */
export class FakeWorkflow {
  readonly instances = new Map<string, { params: unknown; status: InstanceStatus }>();

  async create(options: { id: string; params: unknown }) {
    this.instances.set(options.id, { params: options.params, status: { status: "queued" } });
    return { id: options.id };
  }

  async get(id: string) {
    const instance = this.instances.get(id);
    if (!instance) throw new Error("instance.not_found");
    return { id, status: async () => instance.status };
  }
}

export function fakeEnv(overrides: Partial<Record<keyof Env, unknown>> = {}) {
  const JOBS = new FakeBucket();
  const RENDER = new FakeWorkflow();
  const env = {
    JOBS,
    RENDER,
    BROWSER: {},
    IMAGES: {},
    ASSETS: {
      fetch: async () => new Response("asset", { headers: { "content-type": "text/css" } }),
    },
    API_TOKEN: "secret",
    ...overrides,
  };
  return { env: env as unknown as Env, JOBS, RENDER };
}
