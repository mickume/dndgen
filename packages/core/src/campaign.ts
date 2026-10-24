/**
 * A lorewright campaign as plain data: no file system, so the same code runs in Node and
 * in a Worker.
 */
export interface CampaignSource {
  /** Markdown files, keyed by campaign-relative path with forward slashes. */
  documents: ReadonlyMap<string, string>;
  /** Campaign-relative paths of every other file, such as the art picks. */
  assets: ReadonlySet<string>;
}

export interface AssembleOptions {
  /** Add references/*.md as appendices. Off by default. */
  includeReferences?: boolean;
  /** Add chapters-summary.md, which repeats the overview, as an appendix. Off by default. */
  includeSummary?: boolean;
  /** Theme written to the front matter. Defaults to dndbeyond. */
  theme?: string;
}

export type DocumentRole = "introduction" | "chapter" | "appendix" | "briefing";

export interface CampaignDocument {
  path: string;
  /** Prefix for the heading ids of this document; also the id of its title. */
  key: string;
  role: DocumentRole;
  text: string;
}

export const OVERVIEW = "campaign-overview.md";
const SUMMARY = "chapters-summary.md";
const BRIEFINGS = ["README.md", "briefing.md"];
const CHAPTER = /^chapter-(\d+)\.md$/;
/** Appendix files in book order; anything else follows alphabetically. */
const APPENDIX_ORDER = [
  "npcs.md",
  "locations.md",
  "factions.md",
  "adversaries.md",
  "appendix-monsters.md",
  "monsters.md",
  "magic-items.md",
  "items.md",
  "handouts.md",
  "timeline.md",
];

/** True when the files look like a lorewright campaign rather than an assembled adventure. */
export function isCampaign(paths: Iterable<string>): boolean {
  for (const path of paths) if (path === OVERVIEW) return true;
  return false;
}

/** Picks the documents that go into the book and puts them in book order. */
export function planDocuments(
  source: CampaignSource,
  options: AssembleOptions = {},
): CampaignDocument[] {
  const overview = source.documents.get(OVERVIEW);
  if (overview === undefined) {
    throw new Error(`not a lorewright campaign: ${OVERVIEW} is missing`);
  }
  const chapters: CampaignDocument[] = [];
  const appendices: CampaignDocument[] = [];
  const references: CampaignDocument[] = [];
  let briefing: CampaignDocument | undefined;

  for (const [path, text] of source.documents) {
    const doc = (role: DocumentRole): CampaignDocument => ({ path, key: keyOf(path), role, text });
    if (path.startsWith("references/") && !path.slice(11).includes("/")) {
      if (options.includeReferences && path.endsWith(".md")) references.push(doc("appendix"));
      continue;
    }
    if (path.includes("/") || !path.endsWith(".md") || path === OVERVIEW) continue;
    if (CHAPTER.test(path)) chapters.push(doc("chapter"));
    else if (BRIEFINGS.includes(path)) briefing ??= doc("briefing");
    else if (path !== SUMMARY || options.includeSummary) appendices.push(doc("appendix"));
  }

  chapters.sort((a, b) => chapterNumber(a.path) - chapterNumber(b.path));
  appendices.sort(
    (a, b) => appendixRank(a.path) - appendixRank(b.path) || a.path.localeCompare(b.path),
  );
  references.sort((a, b) => a.path.localeCompare(b.path));

  return [
    { path: OVERVIEW, key: keyOf(OVERVIEW), role: "introduction", text: overview },
    ...chapters,
    ...appendices,
    ...references,
    ...(briefing ? [briefing] : []),
  ];
}

function keyOf(path: string): string {
  return path
    .replace(/\.md$/, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .toLowerCase();
}

function chapterNumber(path: string): number {
  return Number(CHAPTER.exec(path)?.[1] ?? 0);
}

function appendixRank(path: string): number {
  const rank = APPENDIX_ORDER.indexOf(path);
  return rank === -1 ? APPENDIX_ORDER.length : rank;
}

/** Resolves a link target relative to the document it appears in. */
export function resolvePath(from: string, target: string): string {
  const parts = from.split("/").slice(0, -1);
  for (const part of target.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== "." && part !== "") parts.push(part);
  }
  return parts.join("/");
}
