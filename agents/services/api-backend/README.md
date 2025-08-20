# API Backend

Backend service exposing enqueue endpoints, artifacts listing, and UPP webhooks.

## Environment Variables

- `PORT`: API port (default `8080`).
- `DATABASE_URL`: Postgres connection string.
- `STORAGE_PROVIDER`: `local` or `s3`.
- `ARTIFACTS_DIR`: Local storage directory (default `./artifacts`).
- `ARTIFACTS_BASE_URL`: Public base URL for artifacts (e.g. `http://localhost:8080/artifacts`).
- `STORAGE_BUCKET`, `STORAGE_REGION`, `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`: S3 config.
- `MIRROR_ALLOWLIST`: Comma-separated hostnames allowed for mirroring.
- `WEB_REBUILD_URL`: Optional webhook to call after mirror completion.
- `UPP_WEBHOOK_SECRET`: HMAC-SHA256 secret for `/webhooks/upp` signature verification.

## Endpoints

- `GET /health` — Health check.
- `POST /enqueue` — Enqueue a job `{ type, args }`.
- `GET /tasks/:id` — Get job status.
- `POST /mirror` — Shortcut to enqueue a `mirror` job.
- `GET /artifacts/:jobId` — List artifact keys and URLs for a job.
- `POST /upp/invoice` — Create an invoice via UPP client.
- `POST /webhooks/upp` — UPP webhook receiver with signature verification.

## Quick Start

Install deps and build:

```
npm install
npm --workspace packages/db run build
npm --workspace packages/storage run build
npm --workspace packages/intent-router run build
npm --workspace packages/upp-client run build
npm --workspace services/api-backend run build
npm --workspace services/worker run build
```

Run services (dev):

```
cd services/api-backend && npm run dev
cd services/worker && npm run dev
```

## Testing Webhooks (UPP)

Start the API with `UPP_WEBHOOK_SECRET=secret123`. Then send a signed payload:

```
node ./test/upp-webhook.test.js --ok
node ./test/upp-webhook.test.js --bad
```

Expected:
- `--ok` → 200 ok
- `--bad` → 401 invalid_signature

## Testing Mirror Allowlist

With worker running and `MIRROR_ALLOWLIST` set:

```
export MIRROR_ALLOWLIST="example.com"
curl -s -X POST http://localhost:8080/mirror -H 'Content-Type: application/json' \
  -d '{"url":"https://notallowed.com"}' | jq

# Check the worker logs; job should error with domain_not_allowed
```

