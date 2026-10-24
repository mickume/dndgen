import {
  decodePDFRawStream,
  type PDFArray,
  PDFDocument,
  PDFHexString,
  PDFName,
  type PDFRawStream,
  type PDFRef,
} from "pdf-lib";
import { describe, expect, it } from "vitest";
import { finishBook, readOutline } from "../src/pdf.ts";

/** A PDF of `pages` pages with bookmarks the way Chrome writes them: nested, with /Dest arrays. */
async function bookWithOutline(
  pages: number,
  outline: Array<{
    title: string;
    page: number;
    children?: Array<{ title: string; page: number }>;
  }>,
) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([612, 792]).drawText("book");
  const context = doc.context;
  const rootRef = context.nextRef();
  const refs = doc.getPages().map((p) => p.ref);

  const build = (items: typeof outline, parent: PDFRef): PDFRef[] => {
    const itemRefs = items.map(() => context.nextRef());
    items.forEach((item, i) => {
      const dict = context.obj({
        Title: PDFHexString.fromText(item.title),
        Parent: parent,
        Dest: [refs[item.page - 1] as PDFRef, PDFName.of("XYZ"), 0, 792, 0],
      });
      if (i > 0) dict.set(PDFName.of("Prev"), itemRefs[i - 1] as PDFRef);
      if (i < items.length - 1) dict.set(PDFName.of("Next"), itemRefs[i + 1] as PDFRef);
      const children = item.children ? build(item.children, itemRefs[i] as PDFRef) : [];
      if (children.length > 0) {
        dict.set(PDFName.of("First"), children[0] as PDFRef);
        dict.set(PDFName.of("Last"), children[children.length - 1] as PDFRef);
      }
      context.assign(itemRefs[i] as PDFRef, dict);
    });
    return itemRefs;
  };
  const top = build(outline, rootRef);
  context.assign(
    rootRef,
    context.obj({ Type: "Outlines", First: top[0] as PDFRef, Last: top[top.length - 1] as PDFRef }),
  );
  doc.catalog.set(PDFName.of("Outlines"), rootRef);
  return doc.save();
}

describe("readOutline", () => {
  it("flattens nested bookmarks in document order with 1-based pages", async () => {
    const bytes = await bookWithOutline(5, [
      { title: "Contents", page: 2 },
      {
        title: "Introduction",
        page: 3,
        children: [
          { title: "Background", page: 3 },
          { title: "Hooks", page: 4 },
        ],
      },
      { title: "Chapter 1: Root & Ruin", page: 5 },
    ]);
    expect(await readOutline(bytes)).toEqual({
      pageCount: 5,
      entries: [
        { title: "Contents", page: 2 },
        { title: "Introduction", page: 3 },
        { title: "Background", page: 3 },
        { title: "Hooks", page: 4 },
        { title: "Chapter 1: Root & Ruin", page: 5 },
      ],
    });
  });

  it("returns no entries for a PDF without bookmarks", async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    expect(await readOutline(await doc.save())).toEqual({ pageCount: 1, entries: [] });
  });
});

describe("finishBook", () => {
  it("puts the page sheets underneath every page and keeps the bookmarks", async () => {
    const book = await bookWithOutline(2, [{ title: "One", page: 1 }]);
    const sheets = await PDFDocument.create();
    for (let i = 0; i < 3; i++) sheets.addPage([612, 792]).drawText(`sheet ${i}`);
    const finished = await finishBook(book, await sheets.save(), {
      title: "The Book",
      subtitle: "Sub",
      system: "5e",
      theme: "dndbeyond",
    });

    const doc = await PDFDocument.load(finished);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getTitle()).toBe("The Book");
    expect(doc.getSubject()).toBe("Sub");
    expect(doc.getCreator()).toBe("dndgen");
    expect((await readOutline(finished)).entries).toEqual([{ title: "One", page: 1 }]);

    for (const page of doc.getPages()) {
      const contents = page.node.Contents() as PDFArray;
      // The sheets' stream comes first, then the book's own content wrapped in q … Q.
      const streams = contents
        .asArray()
        .map((ref) =>
          new TextDecoder().decode(
            decodePDFRawStream(doc.context.lookup(ref) as PDFRawStream).decode(),
          ),
        );
      expect(streams[0]).toMatch(/ Do\b/);
      expect(streams.slice(1).join("\n")).toMatch(/<626f6f6b> Tj/i);
    }
  });
});
