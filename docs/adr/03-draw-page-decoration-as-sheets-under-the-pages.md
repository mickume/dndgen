# 03. Draw the page decoration as sheets under the pages

## Status

Accepted

## Context

The parchment background and the running footers (page number, chapter title, the gold
accent) belong to the page, not to the flow. CSS does that with `@page` backgrounds and
page-margin boxes, which Chrome supports from version 131. Browser Rendering's client and its
local emulation target Chrome 126, which prints neither: pages came out white and without
footers. Chrome also re-encodes a CSS background image for every page (about 440 KB per page
for the parchment).

## Decision

When the Worker prints, it leaves the decoration out of the book (`decoration: "sheets"`) and
prints it separately as page sheets: one sheet with the background, then one sheet per page
with that page's footer, its chapter title taken from the bookmarks. pdf-lib lays them under
the book's pages by drawing them and moving that content stream to the front of each page's
`/Contents`. The background sheet is embedded once and shared by all pages.

`browser-print.css` keeps the CSS version for printing from a browser.

## Consequences

- Works on any Chrome; the result is the same with or without page-margin boxes.
- The book's pages stay untouched, so links, bookmarks and tags survive.
- The parchment is stored once: the Root & Ruin book is 13.5 MB instead of 36 MB.
- The theme describes the decoration twice: as `@page` rules and as `.page-sheet` styles.
