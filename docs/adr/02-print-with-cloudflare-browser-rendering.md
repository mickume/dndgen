# 02. Print with Cloudflare Browser Rendering

## Status

Accepted

## Context

An adventure in the style of D&D Beyond or Kobold Press needs two-column flow across pages,
embedded fonts, framed boxes, full-bleed art, a table of contents with page numbers and
running footers. Drawing that with a PDF library (the first skeleton used pdf-lib) means
writing a layout engine. Browsers already have one, and the Homebrewery's look is CSS.

## Decision

Render Adventure Markdown to HTML styled with a print theme ported from the Homebrewery,
and print it with Chrome on Cloudflare Browser Rendering (`@cloudflare/puppeteer`), driven
by a Cloudflare Workflow:

- Chrome loads everything from a fake origin; request interception serves theme assets and
  job files and blocks other requests, so no file needs a public URL.
- Page numbers for the contents come from a first print: Chrome's PDF bookmarks
  (`outline: true`) give each heading's page, read back with pdf-lib, then the book is printed
  again with the numbers filled in.
- Uploads go to R2 one file per request, images are scaled with the Images binding, and each
  stage is a retried Workflow step.

## Consequences

- The theme is plain CSS that also works when the HTML is printed from a desktop browser.
- Production Chrome may be old (`@cloudflare/puppeteer` targets Chrome 126); features newer
  than that cannot be relied on, see ADR 03.
- Every render prints the book twice (plus the page sheets); fine for books of tens of pages.
