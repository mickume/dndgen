# CLI

`dndgen` is the command line of `packages/cli`. Run it with `node packages/cli/src/main.ts`,
or `npx dndgen` after `npm install` (Node 24 or later runs the TypeScript directly).

```
dndgen <command> [options] <campaign-dir | adventure.md>
```

## Commands

| Command | Does | Writes by default |
|---|---|---|
| `assemble` | Assembles a lorewright campaign into one [Adventure Markdown](adventure-markdown.md) file. Prints warnings for missing art and broken links | `<campaign>.adventure.md` |
| `preview` | Writes the print HTML, loading the theme and images from disk. Print it from Chrome 131 or later (Save as PDF, background graphics on, margins default) to get the book without a Worker; the contents have no page numbers | `<campaign>.html` |
| `render` | Assembles locally, uploads the Adventure Markdown and the images it uses to a dndgen Worker, waits for the render and downloads the PDF | `<campaign>.pdf` |

`preview` and `render` also accept an Adventure Markdown file instead of a campaign directory;
image paths are then relative to the file.

## Options

| Option | Description |
|---|---|
| `-o, --output <path>` | Output file |
| `--references` | Add `references/*.md` as appendices |
| `--summary` | Add `chapters-summary.md` as an appendix |
| `--theme <name>` | Theme written to the front matter (default `dndbeyond`) |
| `--endpoint <url>` | Worker for `render`; default `$DNDGEN_ENDPOINT`, else `http://localhost:8787` |
| `--token <token>` | API token for `render`; default `$DNDGEN_TOKEN` |
| `-h, --help` | Usage |

Exit status: 0 on success, 1 on errors, 2 on usage errors.

## Examples

```sh
node packages/cli/src/main.ts assemble ../dndcamp/campaigns/root-and-ruin -o root-and-ruin.md

npm run dev &      # local Worker on :8787, token from packages/worker/.dev.vars
DNDGEN_TOKEN=dev-token node packages/cli/src/main.ts render ../dndcamp/campaigns/root-and-ruin
```

## Make targets

| Target | Does |
|---|---|
| `make install` | `npm install` |
| `make check` | Lint (Biome), type check (`tsc -b`) and tests (Vitest): the quality gate |
| `make doc` | Writes each package's declarations to `docs/generated/<package>.txt` |
| `make dev` | `wrangler dev` for the Worker |
| `make deploy` | `wrangler deploy` |
