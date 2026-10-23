import type { AdventureMeta } from "./frontmatter.ts";
import { escapeHtml, type HeadingInfo } from "./markdown.ts";
import { CONTENTS_ID, joinUrl } from "./render.ts";

/** One bookmark of a printed PDF, in document order. */
export interface OutlineEntry {
  title: string;
  /** 1-based page number. */
  page: number;
}

/**
 * Finds the page of every heading by walking the PDF's bookmarks alongside the headings
 * the renderer reported; both are in document order. Bookmarks that match no heading are
 * skipped, so a heading Chrome left out only costs that heading its number.
 */
export function matchOutline(
  headings: readonly HeadingInfo[],
  outline: readonly OutlineEntry[],
): Map<string, number> {
  const pages = new Map<string, number>();
  let next = 0;
  for (const entry of outline) {
    const title = normalize(entry.title);
    for (let i = next; i < headings.length; i++) {
      const heading = headings[i] as HeadingInfo;
      if (normalize(heading.text) === title) {
        pages.set(heading.id, entry.page);
        next = i + 1;
        break;
      }
    }
  }
  return pages;
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * The running footer title of every page (index 0 = page 1), or null for pages without a
 * footer: the cover and table of contents, before the first chapter starts.
 */
export function footerPlan(
  headings: readonly HeadingInfo[],
  pages: ReadonlyMap<string, number>,
  pageCount: number,
): (string | null)[] {
  const starts = headings
    .filter((h) => h.depth === 1 && !h.boxed && h.id !== CONTENTS_ID && pages.has(h.id))
    .map((h) => ({ title: h.text, page: pages.get(h.id) as number }))
    .sort((a, b) => a.page - b.page);
  const plan: (string | null)[] = [];
  for (let page = 1; page <= pageCount; page++) {
    let title: string | null = null;
    for (const start of starts) if (start.page <= page) title = start.title;
    plan.push(title);
  }
  return plan;
}

/**
 * The sheets laid under the printed pages: first the page background, shared by every page,
 * then one sheet per page with its running footer. Print it with a transparent background,
 * so the footer sheets carry nothing else.
 */
export function renderPageSheets(
  meta: AdventureMeta,
  plan: readonly (string | null)[],
  assetUrl: string,
): string {
  const theme = escapeHtml(joinUrl(assetUrl, `themes/${encodeURIComponent(meta.theme)}/theme.css`));
  const sheets = plan.map((title, index) => {
    const page = index + 1;
    if (title === null) return `<div class="page-sheet"></div>`;
    const side = page % 2 === 0 ? "left" : "right";
    return `<div class="page-sheet ${side}"><div class="footer-accent"></div><span class="footer-title">${escapeHtml(title)}</span><span class="footer-number">${page}</span></div>`;
  });
  sheets.unshift(`<div class="page-sheet background"></div>`);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="${theme}">
<style>
@page { margin: 0; }
</style>
</head>
<body class="page-sheets">
${sheets.join("\n")}
<script>document.fonts.ready.then(() => { document.documentElement.dataset.ready = "true"; });</script>
</body>
</html>
`;
}
