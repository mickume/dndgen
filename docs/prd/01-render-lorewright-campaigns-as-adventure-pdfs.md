# 01. Render lorewright campaigns as adventure PDFs

## Problem

The lorewright skill writes a campaign as a directory of cross-linked Markdown files and a
dndig art project. A game master wants one PDF that looks like a published adventure (D&D
Beyond, Kobold Press) to read, print or share, without laying it out by hand.

## What the system does

- Takes a lorewright campaign directory and produces:
  - one Adventure Markdown file holding the whole book, editable and Homebrewery-compatible;
  - a PDF: cover with the campaign's art and title, contents with page numbers, the
    introduction, the chapters, lettered appendices and the player briefing.
- Lays the PDF out in the style of a fifth-edition hardcover: parchment pages, two columns,
  red small-caps headings, drop caps, read-aloud boxes, sidebars, framed stat blocks
  (fifth edition and Daggerheart), handouts as sheets of paper, art in the columns, ASCII
  maps and mermaid diagrams, running footers with chapter title and page number.
- Keeps every cross-reference of the campaign as a working link in the PDF, and the chapters
  and sections as PDF bookmarks.
- Prints placeholders for art that dndig has not generated yet and reports missing art and
  broken links as warnings.
- Runs on Cloudflare: an authenticated HTTP API that accepts uploads, renders in the
  background and serves the PDF, the Markdown and an HTML preview. Locally the same Worker
  runs under `wrangler dev`, and a command line drives it.

## Out of scope

- Themes other than the D&D Beyond look (the theme system allows them).
- Page sizes other than US Letter.
- Accounts, quotas and job listing; jobs are reached by id and expire through an R2 rule.
