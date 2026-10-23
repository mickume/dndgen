# 01. Assemble campaigns into one Adventure Markdown file

## Status

Accepted

## Context

A lorewright campaign is a directory: an overview, chapters, appendices (NPCs, locations,
adversaries, handouts, timeline), a player briefing, references and a dndig art project. The
files link to each other by file and anchor (`npcs.md#spike`), mark read-aloud text with
blockquotes and stat blocks only by their contents. A PDF needs one ordered document with
explicit structure.

The Homebrewery, which this project is the API version of, renders one Markdown file with
`{{block}}` syntax but breaks pages only where the author writes `\page`. Chapters of 80 KB
cannot be paginated by hand.

## Decision

Add an intermediate format, Adventure Markdown ([spec](../adventure-markdown.md)): one file
with a YAML header, GitHub-flavoured Markdown, the Homebrewery's block syntax and heading ids
(`{#id}`), paginated automatically. `assemble()` in `@dndgen/core` turns a campaign into it
using lorewright's conventions (file roles and order, blockquotes, stat-line detection,
sidebars, art paths) and rewrites every cross-file link to an id in the one document.

`assemble()` works on an in-memory map of files, so the CLI and the Worker share it.

## Consequences

- The format is readable and editable, and can be pasted into the Homebrewery.
- The assembler depends on lorewright's conventions; campaigns that stray from them still
  assemble but lose structure (a stat block without a stat line is plain text).
- Rendering never needs to know about campaign directories.
