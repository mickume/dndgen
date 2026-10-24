import type { AdventureMeta, OutlineEntry } from "@dndgen/core";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  type PDFObject,
  PDFRef,
  PDFString,
} from "pdf-lib";

/** The bookmarks of a PDF, flattened in document order, and its page count. */
export async function readOutline(
  bytes: Uint8Array,
): Promise<{ entries: OutlineEntry[]; pageCount: number }> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const pageOf = new Map(doc.getPages().map((page, index) => [page.ref.toString(), index + 1]));
  const entries: OutlineEntry[] = [];
  const outlines = doc.catalog.lookupMaybe(PDFName.of("Outlines"), PDFDict);

  // Depth-first, iteratively: children before the next sibling, which is document order.
  const stack: PDFDict[] = [];
  const first = outlines?.lookupMaybe(PDFName.of("First"), PDFDict);
  if (first) stack.push(first);
  while (stack.length > 0) {
    const item = stack.pop() as PDFDict;
    const next = item.lookupMaybe(PDFName.of("Next"), PDFDict);
    if (next) stack.push(next);
    const child = item.lookupMaybe(PDFName.of("First"), PDFDict);
    if (child) stack.push(child);
    const page = destinationPage(doc, item, pageOf);
    if (page !== undefined) entries.push({ title: text(item.lookup(PDFName.of("Title"))), page });
  }
  return { entries, pageCount: doc.getPageCount() };
}

function destinationPage(
  doc: PDFDocument,
  item: PDFDict,
  pageOf: Map<string, number>,
): number | undefined {
  let dest: PDFObject | undefined = item.lookup(PDFName.of("Dest"));
  if (!dest) dest = item.lookupMaybe(PDFName.of("A"), PDFDict)?.lookup(PDFName.of("D"));
  if (dest instanceof PDFName || dest instanceof PDFString || dest instanceof PDFHexString) {
    dest = namedDestination(doc, dest instanceof PDFName ? dest.decodeText() : dest.decodeText());
  }
  if (dest instanceof PDFDict) dest = dest.lookup(PDFName.of("D"));
  if (!(dest instanceof PDFArray)) return undefined;
  const target = dest.get(0);
  return target instanceof PDFRef ? pageOf.get(target.toString()) : undefined;
}

/** Looks a named destination up in the catalog's /Dests dictionary or /Names tree. */
function namedDestination(doc: PDFDocument, name: string): PDFObject | undefined {
  const dests = doc.catalog.lookupMaybe(PDFName.of("Dests"), PDFDict);
  const direct = dests?.lookup(PDFName.of(name));
  if (direct) return direct;
  const tree = doc.catalog
    .lookupMaybe(PDFName.of("Names"), PDFDict)
    ?.lookupMaybe(PDFName.of("Dests"), PDFDict);
  const nodes = tree ? [tree] : [];
  while (nodes.length > 0) {
    const node = nodes.pop() as PDFDict;
    const names = node.lookupMaybe(PDFName.of("Names"), PDFArray);
    for (let i = 0; names && i + 1 < names.size(); i += 2) {
      if (text(names.lookup(i)) === name) return names.lookup(i + 1);
    }
    const kids = node.lookupMaybe(PDFName.of("Kids"), PDFArray);
    for (let i = 0; kids && i < kids.size(); i++) {
      const kid = kids.lookup(i);
      if (kid instanceof PDFDict) nodes.push(kid);
    }
  }
  return undefined;
}

function text(value: PDFObject | undefined): string {
  if (value instanceof PDFString || value instanceof PDFHexString) return value.decodeText();
  if (value instanceof PDFName) return value.decodeText();
  return "";
}

/**
 * Lays the page sheets (see renderPageSheets) under the book, which was printed on a
 * transparent background: the shared background sheet under every page, then each page's
 * own footer sheet. The background is embedded once, so it is stored once. The book keeps
 * its links, bookmarks and tags because its pages stay as they are; only a content stream
 * is put in front of each.
 */
export async function finishBook(
  book: Uint8Array,
  sheetsPdf: Uint8Array,
  meta: AdventureMeta,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(book, { updateMetadata: false });
  const sheets = await PDFDocument.load(sheetsPdf);
  const pages = doc.getPages();
  const count = Math.min(pages.length, sheets.getPageCount() - 1);
  const [background, ...footers] = await doc.embedPdf(sheets, [...Array(count + 1).keys()]);
  pages.forEach((page, index) => {
    const full = { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() };
    const footer = footers[index];
    if (background) page.drawPage(background, full);
    if (footer) page.drawPage(footer, full);
    // pdf-lib appends one stream with both drawings; painting order is stream order, so
    // that stream goes first, under the book's own content.
    const contents = page.node.Contents();
    if (contents instanceof PDFArray && contents.size() > 1) {
      const drawn = contents.get(contents.size() - 1);
      contents.remove(contents.size() - 1);
      contents.insert(0, drawn);
    }
  });
  doc.setTitle(meta.title, { showInWindowTitleBar: true });
  if (meta.subtitle) doc.setSubject(meta.subtitle);
  doc.setCreator("dndgen");
  doc.setProducer("dndgen on Cloudflare Browser Rendering");
  return doc.save({ useObjectStreams: true });
}
