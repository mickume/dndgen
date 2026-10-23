# Adventure Markdown

Adventure Markdown is the single-file format between a lorewright campaign and the PDF.
`dndgen assemble` (or the Worker) writes it from a campaign directory; the renderer turns it
into print HTML. It is GitHub-flavoured Markdown plus a YAML header and the block syntax of
the [Homebrewery](https://github.com/mickume/homebrewery), so an assembled file can also be
pasted into the Homebrewery and finished by hand there (add `\page` breaks, since the
Homebrewery does not paginate on its own).

Unlike the Homebrewery, pages break automatically: content flows through two columns and
onto new pages as needed, and every top-level heading starts a new page.

## Front matter

```yaml
---
title: Root & Ruin                       # cover title and PDF title
subtitle: A Castle High Halloween one-shot for Daggerheart
system: daggerheart                      # 5e | daggerheart; default 5e
theme: dndbeyond                         # default dndbeyond
cover: art/scenes/images/the-summoning.jpg   # full-bleed cover art; optional
toc: true                                # table of contents after the cover; default true
---
```

Paths are relative to the file (for an assembled campaign: the campaign directory).

## Structure

- `# Heading` starts a chapter: a new page, a running footer with that title, and an entry
  in the table of contents. `##` headings are listed under it. Deeper headings are not.
- A heading takes its id from a trailing `{#id}`: `## Scene 1: The Circle {#chapter-01--scene-1-the-circle}`.
  Without one, the id is the GitHub-style slug of the text. Links point at ids: `[Spike](#npcs--spike)`.
- `\page` on its own line forces a page break, `\column` a column break.

## Blocks

A block opens with `{{` and comma-separated class names at the start of a line and closes
with `}}` on a line of its own. Blocks nest. `#name` among the classes sets the block's id.

| Block | Use | Looks like |
|---|---|---|
| `{{descriptive … }}` | Read-aloud text | Cream box with the PHB's border |
| `{{note … }}` | Sidebar, DM tip; start it with a `#####` title | Green box with a shadow |
| `{{info … }}` | "At a glance" lines under a chapter title | Ruled box in the sans face |
| `{{handout … }}` | A player handout; line breaks are kept | A sheet of paper laid on the page |
| `{{monster,frame,5e … }}`, `{{monster,frame,daggerheart … }}` | Stat block | Framed parchment stat block |
| `{{stats … }}` | The stat lines inside a stat block | Ruled band in red |
| `{{figure,<kind> … }}` | One image: `![Alt](path)` | Picture in the column |

Figure kinds are `character`, `location`, `scene`, `item`, `map` or `image`. A figure with
the extra class `missing` prints a placeholder frame with the alt text, for art that has not
been generated yet.

Code blocks without a language print as maps (lorewright's ASCII maps); ` ```mermaid ` blocks
are drawn as diagrams by the browser.

## From a lorewright campaign

`assemble` reads a campaign directory as described in the lorewright skill's `STRUCTURE.md`
and `formatting-conventions.md` and applies these rules:

| Campaign | Adventure Markdown |
|---|---|
| `campaign-overview.md` | `# Introduction`; its H1 becomes the front-matter `title`, the italic line under it the `subtitle` |
| `chapter-NN.md` | Chapters, in numeric order |
| `npcs.md`, `locations.md`, `factions.md`, `adversaries.md`, `appendix-monsters.md`, `monsters.md`, `magic-items.md`, `items.md`, `handouts.md`, `timeline.md`, then any other top-level `*.md` alphabetically | `# Appendix A: …`, `# Appendix B: …`; existing "Appendix X:" prefixes and "— Campaign Title" suffixes are replaced |
| `README.md` (or `briefing.md`) | The last appendix: Player Briefing |
| `chapters-summary.md` | Left out (it repeats the overview); `--summary` adds it |
| `references/*.md` | Left out; `--references` adds them. Other files in `references/` never go in |
| `art/**` | Only the picks the text embeds |
| `**Key:** value` lines right under a document's title | `{{info}}` |
| `> blockquote` | `{{descriptive}}`, or `{{handout}}` in `handouts.md` |
| A heading whose own text has a stat line (`> **Difficulty:**` for Daggerheart, `**AC**`/`**Armor Class**` with `**HP**`/`**Hit Points**` for 5e) | That heading's whole section in `{{monster,frame,<system>}}`, stat lines in `{{stats}}` |
| `---` + `**💡 Title**` … `---` | `{{note}}` with a `##### Title` |
| Other `---` rules | Dropped |
| `![Alt](art/<kind>/images/<title>.jpg)` alone in a paragraph | `{{figure,<kind>}}`; each picture is printed once, except portraits, which also appear in the NPC appendix |
| A section that only lists links to campaign files (the overview's "Appendices") | Dropped |
| Paragraphs whose lines all start with `**` | Line breaks kept |
| `[x](npcs.md#spike)`, `[x](#local)` | `[x](#npcs--spike)`, `[x](#chapter-01--local)`: ids are `<file>--<slug>`, a document's title is `<file>` |
| A link labelled with a file name, such as `[npcs.md#spike](npcs.md#spike)` | Labelled with the title it points at: `[Spike](#npcs--spike)` |
| Links to files that are not in the book | Plain text |

The system is taken from the overview's `**System:**` line, or else from the first stat block.
The cover is the first scene picture in the book, or else the first location picture.
Missing pictures and links to headings that do not exist are reported as warnings.
