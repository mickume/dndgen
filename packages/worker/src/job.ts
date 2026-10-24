import {
  adventureAssets,
  assemble,
  footerPlan,
  isCampaign,
  matchOutline,
  parseAdventure,
  renderHtml,
  renderPageSheets,
} from "@dndgen/core";
import { type Env, type JobReport, keys } from "./env.ts";
import { finishBook, readOutline } from "./pdf.ts";
import { ASSET_URL, DOCUMENT_URL, Printer, type Resolver } from "./print.ts";

/** Longest edge of an image after it is prepared for print. */
const PRINT_EDGE = 1800;
const RESIZABLE = /\.(jpe?g|png|webp)$/i;

export interface Assembled {
  title: string;
  assets: string[];
  warnings: string[];
}

/**
 * Turns the uploaded files into adventure.md: assembles a lorewright campaign, or takes an
 * uploaded Adventure Markdown file as it is.
 */
export async function assembleJob(env: Env, id: string): Promise<Assembled> {
  const prefix = keys.source(id);
  const paths: string[] = [];
  let cursor: string | undefined;
  do {
    const listing = await env.JOBS.list({ prefix, ...(cursor ? { cursor } : {}) });
    for (const object of listing.objects) paths.push(object.key.slice(prefix.length));
    cursor = listing.truncated ? listing.cursor : undefined;
  } while (cursor);

  const read = async (path: string): Promise<string> => {
    const object = await env.JOBS.get(keys.source(id, path));
    if (!object) throw new Error(`${path} disappeared`);
    return object.text();
  };

  if (isCampaign(paths)) {
    const documents = new Map<string, string>();
    const assets = new Set<string>();
    for (const path of paths) {
      if (path.endsWith(".md") && !path.startsWith("art/")) documents.set(path, await read(path));
      else assets.add(path);
    }
    const result = assemble({ documents, assets });
    await env.JOBS.put(keys.adventure(id), result.markdown, {
      httpMetadata: { contentType: "text/markdown; charset=utf-8" },
    });
    return { title: result.meta.title, assets: result.assets, warnings: result.warnings };
  }

  const markdownFiles = paths.filter((path) => path.endsWith(".md") && !path.includes("/"));
  const main = markdownFiles.includes("adventure.md")
    ? "adventure.md"
    : markdownFiles.length === 1
      ? markdownFiles[0]
      : undefined;
  if (!main) {
    throw new Error(
      "upload a lorewright campaign (with campaign-overview.md) or one Adventure Markdown file named adventure.md",
    );
  }
  const markdown = await read(main);
  const { meta } = parseAdventure(markdown);
  const uploaded = new Set(paths);
  const assets = adventureAssets(markdown);
  const warnings = assets
    .filter((path) => !uploaded.has(path))
    .map((path) => `image ${path} was not uploaded`);
  await env.JOBS.put(keys.adventure(id), markdown, {
    httpMetadata: { contentType: "text/markdown; charset=utf-8" },
  });
  return { title: meta.title, assets: assets.filter((path) => uploaded.has(path)), warnings };
}

/**
 * Scales an image down to print size with Cloudflare Images. Returns a warning when that
 * fails; the original is printed then.
 */
export async function prepareImage(env: Env, id: string, path: string): Promise<string | null> {
  if (!RESIZABLE.test(path)) return null;
  const source = await env.JOBS.get(keys.source(id, path));
  if (!source) return `image ${path} disappeared`;
  try {
    const format = /\.png$/i.test(path) ? "image/png" : "image/jpeg";
    const result = await env.IMAGES.input(source.body)
      .transform({ width: PRINT_EDGE, height: PRINT_EDGE, fit: "scale-down" })
      .output({ format, quality: 82 });
    const bytes = await new Response(result.image()).arrayBuffer();
    await env.JOBS.put(keys.print(id, path), bytes, {
      httpMetadata: { contentType: result.contentType() },
    });
    return null;
  } catch (error) {
    return `image ${path} was printed at full size: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Prints adventure.md: a first pass to learn on which page every heading lands, a second
 * with those numbers in the table of contents, then the page sheets (parchment and running
 * footers) that go underneath.
 */
export async function printJob(env: Env, id: string, warnings: string[]): Promise<JobReport> {
  const object = await env.JOBS.get(keys.adventure(id));
  if (!object) throw new Error("adventure.md is missing; the assemble step did not finish");
  const markdown = await object.text();

  const printer = await Printer.open(env.BROWSER, resolver(env, id));
  try {
    const options = { baseUrl: DOCUMENT_URL, assetUrl: ASSET_URL, decoration: "sheets" as const };
    const draft = renderHtml(markdown, options);
    const firstPass = await readOutline(await printer.print(draft.html));
    let pages = matchOutline(draft.headings, firstPass.entries);

    // Page numbers have a fixed width in the contents, so the layout should not move;
    // print once more if it did.
    let book = renderHtml(markdown, { ...options, pageNumbers: pages });
    let pdf = await printer.print(book.html, { transparent: true });
    let outline = await readOutline(pdf);
    const settled = matchOutline(book.headings, outline.entries);
    if ([...settled].some(([heading, page]) => pages.get(heading) !== page)) {
      pages = settled;
      book = renderHtml(markdown, { ...options, pageNumbers: pages });
      pdf = await printer.print(book.html, { transparent: true });
      outline = await readOutline(pdf);
      pages = matchOutline(book.headings, outline.entries);
    } else {
      pages = settled;
    }
    if (pages.size === 0)
      warnings.push("the PDF has no outline, so the contents have no page numbers");

    const plan = footerPlan(book.headings, pages, outline.pageCount);
    const sheets = await printer.print(renderPageSheets(book.meta, plan, ASSET_URL), {
      transparent: true,
    });
    const finished = await finishBook(pdf, sheets, book.meta);
    await env.JOBS.put(keys.pdf(id), finished, {
      httpMetadata: { contentType: "application/pdf" },
    });

    const report: JobReport = {
      title: book.meta.title,
      pages: outline.pageCount,
      bytes: finished.byteLength,
      warnings,
    };
    await env.JOBS.put(keys.report(id), JSON.stringify(report), {
      httpMetadata: { contentType: "application/json" },
    });
    return report;
  } finally {
    await printer.close();
  }
}

/** Serves the print page's requests: theme assets, then the job's prepared or original files. */
export function resolver(env: Env, id: string): Resolver {
  return async (path) => {
    if (path.startsWith("assets/")) {
      const response = await env.ASSETS.fetch(
        new Request(`https://assets.invalid/${path.slice(7)}`),
      );
      return response.ok ? response : undefined;
    }
    if (!path.startsWith("doc/")) return undefined;
    const file = path.slice(4);
    const object =
      (await env.JOBS.get(keys.print(id, file))) ?? (await env.JOBS.get(keys.source(id, file)));
    if (!object) return undefined;
    return new Response(object.body, {
      headers: { "content-type": object.httpMetadata?.contentType ?? contentType(file) },
    });
  };
}

export function contentType(path: string): string {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  const types: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
    md: "text/markdown; charset=utf-8",
  };
  return types[extension] ?? "application/octet-stream";
}
