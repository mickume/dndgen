import { parse, stringify } from "yaml";

export type GameSystem = "5e" | "daggerheart";

/** The YAML header of an Adventure Markdown document. */
export interface AdventureMeta {
  title: string;
  subtitle?: string;
  system: GameSystem;
  theme: string;
  /** Campaign-relative path of the cover image. */
  cover?: string;
  /** Print a table of contents after the cover. Defaults to true. */
  toc?: boolean;
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function splitFrontMatter(source: string): { data: Record<string, unknown>; body: string } {
  const match = FENCE.exec(source);
  if (!match) return { data: {}, body: source };
  const data: unknown = parse(match[1] ?? "");
  if (data !== null && (typeof data !== "object" || Array.isArray(data))) {
    throw new Error("front matter must be a YAML mapping");
  }
  return { data: (data ?? {}) as Record<string, unknown>, body: source.slice(match[0].length) };
}

/** Reads the header of an Adventure Markdown document, filling in defaults. */
export function parseAdventure(source: string): { meta: AdventureMeta; body: string } {
  const { data, body } = splitFrontMatter(source);
  const str = (key: string): string | undefined => {
    const value = data[key];
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "string") throw new Error(`front matter "${key}" must be a string`);
    return value;
  };
  const system = str("system") ?? "5e";
  if (system !== "5e" && system !== "daggerheart") {
    throw new Error(`front matter "system" must be 5e or daggerheart, not ${system}`);
  }
  const toc = data.toc;
  if (toc !== undefined && typeof toc !== "boolean") {
    throw new Error('front matter "toc" must be true or false');
  }
  const meta: AdventureMeta = {
    title: str("title") ?? "Untitled Adventure",
    system,
    theme: str("theme") ?? "dndbeyond",
  };
  const subtitle = str("subtitle");
  if (subtitle) meta.subtitle = subtitle;
  const cover = str("cover");
  if (cover) meta.cover = cover;
  if (toc !== undefined) meta.toc = toc;
  return { meta, body };
}

export function formatFrontMatter(meta: AdventureMeta): string {
  return `---\n${stringify(meta, { lineWidth: 0 })}---\n`;
}
