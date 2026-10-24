# API

The Worker serves a JSON API under `/v1`. Requests that create or change a job need
`Authorization: Bearer <API_TOKEN>`. Reading a job needs only its id, a random UUID that
works as a capability: share it only with people who may read the job.

Everything else (`/themes/…`, `/vendor/…`) is the theme's static files.

## Rendering a campaign

```sh
# 1. Create a job
curl -X POST -H "Authorization: Bearer $TOKEN" https://dndgen.example.workers.dev/v1/jobs
# {"id":"6f1c…","status":"uploading"}

# 2. Upload files, one request each, at their campaign-relative paths
curl -X PUT -H "Authorization: Bearer $TOKEN" --data-binary @campaign-overview.md \
  https://dndgen.example.workers.dev/v1/jobs/6f1c…/files/campaign-overview.md

# 3. Start the render, then poll the job until it is done
curl -X POST -H "Authorization: Bearer $TOKEN" https://dndgen.example.workers.dev/v1/jobs/6f1c…/render
curl https://dndgen.example.workers.dev/v1/jobs/6f1c…
```

Upload either a lorewright campaign (it must contain `campaign-overview.md`; the Worker
assembles it) or one Adventure Markdown file named `adventure.md` with the images it embeds.
`dndgen render` does all of this.

## Endpoints

| Method and path | Auth | Description |
|---|---|---|
| `GET /v1/health` | – | `{"ok":true}` |
| `POST /v1/jobs` | token | Creates a job. `201 {"id","status":"uploading"}` |
| `PUT /v1/jobs/:id/files/*path` | token | Stores one file at `path` (URL-encoded segments). Needs `Content-Length`; at most 50 MiB. `204`. `400` for paths with empty, `.` or `..` segments or control characters; `409` once rendering has started; `413` when too large |
| `POST /v1/jobs/:id/render` | token | Starts the render workflow. `202 {"id","status":"queued"}`; `409` if it has already started |
| `GET /v1/jobs/:id` | – | Job status, see below |
| `GET /v1/jobs/:id/adventure.pdf` | – | The PDF, as an attachment named after the title. `404` until done |
| `GET /v1/jobs/:id/adventure.md` | – | The Adventure Markdown. `404` until assembled |
| `GET /v1/jobs/:id/preview` | – | The print HTML, with the CSS page decoration, for viewing in a browser |
| `GET /v1/jobs/:id/files/*path` | – | A job file: the print-sized copy of an image if there is one, else the upload |

Unknown job ids get `404 {"error":"no such job"}`. Errors are `{"error": "<message>"}`;
a missing or wrong token is `401`, and `503` means the Worker has no `API_TOKEN` set.

## Job status

```json
{
  "id": "6f1c…",
  "status": "done",
  "report": { "title": "Root & Ruin", "pages": 54, "bytes": 13506788, "warnings": [] },
  "pdf": "https://…/v1/jobs/6f1c…/adventure.pdf",
  "markdown": "https://…/v1/jobs/6f1c…/adventure.md",
  "preview": "https://…/v1/jobs/6f1c…/preview"
}
```

| `status` | Meaning |
|---|---|
| `uploading` | Created, render not started |
| `queued` | Render workflow waiting to start |
| `rendering` | Assembling, preparing images or printing; `markdown` and `preview` appear |
| `done` | `report` and `pdf` appear. `report.warnings` lists missing images, broken links and images printed at full size |
| `failed` | `error` says why, for example an upload with neither a campaign nor `adventure.md` |

## Library API

The exported TypeScript API of each package is in [generated/](generated/) (`make doc`).
