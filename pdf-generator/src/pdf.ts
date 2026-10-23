import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { Campaign } from "./campaign";

const PAGE = { w: 612, h: 792 };
const MARGIN = 54;
const ACCENT = rgb(0.58, 0.11, 0.09);
const TEXT = rgb(0.1, 0.1, 0.1);

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function renderCampaign(campaign: Campaign): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(campaign.title);
  if (campaign.author) doc.setAuthor(campaign.author);
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const heading = await doc.embedFont(StandardFonts.TimesRomanBold);
  const width = PAGE.w - 2 * MARGIN;

  // Cover page
  const cover = doc.addPage([PAGE.w, PAGE.h]);
  cover.drawText(campaign.title, { x: MARGIN, y: PAGE.h - 250, size: 36, font: heading, color: ACCENT });
  if (campaign.author) {
    cover.drawText(`by ${campaign.author}`, { x: MARGIN, y: PAGE.h - 290, size: 14, font: serif, color: TEXT });
  }
  let page: PDFPage = cover;
  let y = PAGE.h - 330;
  if (campaign.summary) {
    for (const l of wrap(campaign.summary, serif, 12, width)) {
      cover.drawText(l, { x: MARGIN, y, size: 12, font: serif, color: TEXT });
      y -= 16;
    }
  }

  const ensure = (needed: number) => {
    if (y - needed < MARGIN) {
      page = doc.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - MARGIN;
    }
  };

  for (const chapter of campaign.chapters) {
    page = doc.addPage([PAGE.w, PAGE.h]);
    y = PAGE.h - MARGIN;
    page.drawText(chapter.title, { x: MARGIN, y: y - 24, size: 26, font: heading, color: ACCENT });
    y -= 40;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE.w - MARGIN, y }, thickness: 1.5, color: ACCENT });
    y -= 24;
    for (const section of chapter.sections) {
      ensure(40);
      page.drawText(section.title, { x: MARGIN, y, size: 16, font: heading, color: ACCENT });
      y -= 22;
      for (const l of wrap(section.body, serif, 11, width)) {
        ensure(14);
        page.drawText(l, { x: MARGIN, y, size: 11, font: serif, color: TEXT });
        y -= 14;
      }
      y -= 10;
    }
  }
  return doc.save();
}
