import { type AdventureMeta, parseAdventure } from "./frontmatter.ts";
import { escapeHtml, type HeadingInfo, markdownToHtml } from "./markdown.ts";

export interface RenderOptions {
  /** URL that the document's relative image paths resolve against: the campaign root, ending in "/". */
  baseUrl: string;
  /** URL of the core package's assets/ directory (themes/ and vendor/), ending in "/". */
  assetUrl: string;
  /** Page numbers for the table of contents, by heading id. Omitted on a first pass. */
  pageNumbers?: ReadonlyMap<string, number>;
  /**
   * How the parchment and running footers get onto the pages: "css" draws them with @page
   * rules, which need Chrome 131 or later; "sheets" leaves them out, to be printed as
   * separate page sheets and laid underneath (see sheets.ts).
   */
  decoration?: "css" | "sheets";
}

export interface RenderResult {
  html: string;
  meta: AdventureMeta;
  /** Every heading in document order, as a browser's PDF outline will list them. */
  headings: HeadingInfo[];
}

/** Id of the table of contents heading. */
export const CONTENTS_ID = "contents";
const CHAPTER_MARK = "<!--dndgen:chapter-->";

/**
 * Renders an Adventure Markdown document as one HTML page meant to be printed by Chrome:
 * cover, table of contents, then one section per chapter (each top-level heading). The page
 * sets `data-ready` on <html> once fonts, images and diagrams are done.
 */
export function renderHtml(markdown: string, options: RenderOptions): RenderResult {
  const { meta, body } = parseAdventure(markdown);
  const { html, headings } = markdownToHtml(
    body.replace(/^# /gm, (m, offset: number, src: string) =>
      inFence(src, offset) ? m : `${CHAPTER_MARK}\n\n# `,
    ),
  );

  const chapters = html.split(CHAPTER_MARK).filter((part) => part.trim() !== "");
  const pageStyles: string[] = [];
  const sections = chapters.map((content, index) => {
    const id = /^\s*<h1 id="([^"]+)"/.exec(content)?.[1];
    const title = headings.find((h) => escapeHtml(h.id) === id)?.text;
    const name = `chapter-${index + 1}`;
    if (title && options.decoration !== "sheets") pageStyles.push(footerRules(name, title));
    return `<section class="chapter" style="page: ${name}">\n${content}</section>`;
  });

  const tocEnabled = meta.toc !== false;
  const asset = (path: string): string => escapeHtml(joinUrl(options.assetUrl, path));
  const mermaid = html.includes('class="mermaid"')
    ? `<script src="${asset("vendor/mermaid.min.js")}"></script>\n`
    : "";

  const page = `<!doctype html>
<html lang="en" data-system="${meta.system}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(meta.title)}</title>
<base href="${escapeHtml(options.baseUrl)}">
<link rel="stylesheet" href="${asset(`themes/${encodeURIComponent(meta.theme)}/theme.css`)}">
${options.decoration === "sheets" ? "" : `<link rel="stylesheet" href="${asset(`themes/${encodeURIComponent(meta.theme)}/browser-print.css`)}">\n`}<style>
${pageStyles.join("\n")}
</style>
${mermaid}</head>
<body class="system-${meta.system}">
${cover(meta)}
${tocEnabled ? contents(headings, options.pageNumbers) : ""}
${sections.join("\n")}
<script>${READY_SCRIPT}</script>
</body>
</html>
`;
  const outline = tocEnabled
    ? [{ id: CONTENTS_ID, depth: 1, text: "Contents", boxed: false }, ...headings]
    : headings;
  return { html: page, meta, headings: outline };
}

function cover(meta: AdventureMeta): string {
  const art = meta.cover ? `<img class="cover-art" src="${escapeHtml(meta.cover)}" alt="">` : "";
  const subtitle = meta.subtitle
    ? `<p class="cover-subtitle">${escapeHtml(meta.subtitle)}</p>`
    : "";
  const system =
    meta.system === "daggerheart" ? "A Daggerheart Adventure" : "A Fifth Edition Adventure";
  return `<section class="cover${meta.cover ? "" : " no-art"}">
${art}
<div class="cover-title"><p class="cover-name">${escapeHtml(meta.title)}</p>${subtitle}</div>
<p class="cover-banner">${system}</p>
</section>`;
}

function contents(headings: HeadingInfo[], pages: ReadonlyMap<string, number> | undefined): string {
  const entries = headings.filter((h) => !h.boxed && h.depth <= 2);
  const items: string[] = [];
  let open = false;
  for (const h of entries) {
    const page = pages?.get(h.id);
    const line = `<a href="#${escapeHtml(h.id)}"><span class="toc-label">${escapeHtml(h.text)}</span><span class="toc-page">${page ?? ""}</span></a>`;
    if (h.depth === 1) {
      if (open) items.push("</ol></li>");
      items.push(`<li class="toc-1">${line}<ol>`);
      open = true;
    } else {
      items.push(`<li class="toc-2">${line}</li>`);
    }
  }
  if (open) items.push("</ol></li>");
  return `<section class="toc">
<h1 id="${CONTENTS_ID}">Contents</h1>
<ol>
${items.join("\n").replace(/<ol><\/ol>/g, "")}
</ol>
</section>`;
}

/** Appends a relative path to a directory URL. */
export function joinUrl(base: string, path: string): string {
  return base.endsWith("/") ? `${base}${path}` : `${base}/${path}`;
}

/** Running footer of a chapter's pages: its title beside the page number. */
function footerRules(name: string, title: string): string {
  const text = `"${title.replace(/["\\]/g, "\\$&")}"`;
  return `@page ${name}:right { @bottom-right { content: ${text}; } }
@page ${name}:left { @bottom-left { content: ${text}; } }`;
}

/** True when offset lies inside a fenced code block of src. */
function inFence(src: string, offset: number): boolean {
  const fences = src.slice(0, offset).match(/^(?:```|~~~)/gm);
  return (fences?.length ?? 0) % 2 === 1;
}

const READY_SCRIPT = `(async () => {
  try {
    if (window.mermaid) {
      mermaid.initialize({ startOnLoad: false, theme: "neutral", flowchart: { htmlLabels: false } });
      await mermaid.run({ querySelector: "pre.mermaid" });
    }
  } catch (e) { console.error(e); }
  await document.fonts.ready;
  await Promise.all([...document.images].map((img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })));
  document.documentElement.dataset.ready = "true";
})();`;
