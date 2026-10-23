# Configuration

## Worker (`packages/worker/wrangler.jsonc`)

| Binding | Type | Purpose |
|---|---|---|
| `JOBS` | R2 bucket `dndgen-jobs` | Uploads, `adventure.md`, print-sized images, PDFs and reports under `jobs/<id>/` |
| `BROWSER` | Browser Rendering | Chrome that prints the PDF |
| `IMAGES` | Images | Scales pictures down to print size |
| `RENDER` | Workflow `dndgen-render` (`RenderWorkflow`) | Runs a job's steps with retries |
| `ASSETS` | Static assets from `packages/core/assets` | Themes and vendored mermaid, for Chrome and for previews |

`limits.cpu_ms` is 300000 (five minutes): assembling and pdf-lib post-processing of a long
book take CPU time. The `build` command vendors mermaid before every `wrangler dev` or
`wrangler deploy`. `nodejs_compat` is on for `@cloudflare/puppeteer`.

### Secrets and variables

| Name | Required | Description |
|---|---|---|
| `API_TOKEN` | yes | Bearer token for creating, uploading and starting jobs. Without it every write answers `503` |

Set it with `npx wrangler secret put API_TOKEN` (in `packages/worker`). For `wrangler dev`,
copy `packages/worker/.dev.vars.example` to `.dev.vars`.

### Setting up an account

```sh
cd packages/worker
npx wrangler r2 bucket create dndgen-jobs
# Delete jobs after seven days; nothing else cleans them up.
npx wrangler r2 bucket lifecycle add dndgen-jobs expire-jobs jobs/ --expire-days 7
npx wrangler secret put API_TOKEN
npx wrangler deploy
```

Browser Rendering, Workflows and the Images binding are available on the Free plan with
limits on browser time and transformations; use Workers Paid for regular use.

### Local development

`wrangler dev` runs every binding locally. Browser Rendering downloads Chrome 126 into
wrangler's cache on first use (the version `@cloudflare/puppeteer` targets), so the local
render matches production.

## CLI

| Variable | Description |
|---|---|
| `DNDGEN_ENDPOINT` | Worker URL for `dndgen render` (default `http://localhost:8787`) |
| `DNDGEN_TOKEN` | API token for `dndgen render` |
