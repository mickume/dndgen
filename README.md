# dndgen

Turns a D&D or Daggerheart campaign written with the
[lorewright skill](https://github.com/mickume/lorewright-skill) (art by
[dndig](https://github.com/mickume/dndig)) into a PDF that looks like a published adventure:
parchment pages in two columns, read-aloud boxes, framed stat blocks, handouts, art, a table
of contents with page numbers and running footers. It is the API version of
[the Homebrewery](https://github.com/mickume/homebrewery) and runs on Cloudflare.

It works in two steps:

1. **Assemble**: the campaign directory becomes one
   [Adventure Markdown](docs/adventure-markdown.md) file. You can read and edit it, or paste
   it into the Homebrewery.
2. **Print**: a Cloudflare Worker prints that file to PDF with Browser Rendering.

## Quick start

Requirements: Node.js 24 or later and npm. Linux and macOS are supported.

```sh
npm install
make check                       # lint, type check and tests

# The whole campaign as one Markdown file (offline)
npx dndgen assemble path/to/campaigns/root-and-ruin

# The PDF, through a local Worker
cp packages/worker/.dev.vars.example packages/worker/.dev.vars
npm run dev                      # wrangler dev on http://localhost:8787
DNDGEN_TOKEN=dev-token npx dndgen render path/to/campaigns/root-and-ruin
```

The first local render downloads Chrome for the Browser Rendering emulation.
`npx dndgen preview <campaign>` writes an HTML page you can print from Chrome 131 or later
instead.

To deploy, create the R2 bucket and the API token as described in
[docs/configuration.md](docs/configuration.md), then run `npm run deploy`.

## Documentation

- [docs/adventure-markdown.md](docs/adventure-markdown.md): the format and how a campaign maps onto it
- [docs/architecture.md](docs/architecture.md): packages, data flow, the render workflow
- [docs/api.md](docs/api.md): the Worker's HTTP API
- [docs/cli.md](docs/cli.md): the `dndgen` command and make targets
- [docs/configuration.md](docs/configuration.md): bindings, secrets, account setup
- [docs/adr/](docs/adr/) and [docs/prd/](docs/prd/): decisions and requirements
- [docs/generated/](docs/generated/): the exported API of each package (`make doc`)

## License

MIT for the code. The theme includes the Homebrewery's MIT-licensed styles and images and
Solbera's CC BY-SA 4.0 fonts; see
[packages/core/assets/themes/dndbeyond/NOTICE.md](packages/core/assets/themes/dndbeyond/NOTICE.md).
