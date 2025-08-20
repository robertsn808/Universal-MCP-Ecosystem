# Video Adapters

Unified interface and CLI to generate videos with providers (Runway, Luma, Pika).

## Package

- API: `createProvider(name).start(params)`, `status(id)`
- Simulated mode: if provider API keys are missing, adapters simulate progress and return a data-URL artifact for testing.

### Env Vars (Runway)

- `RUNWAY_API_KEY`: required for real requests
- `RUNWAY_USE_REAL=1`: enable real HTTP calls (otherwise simulated)
- `RUNWAY_BASE_URL`: default `https://api.runwayml.com`
- `RUNWAY_START_ENDPOINT`: e.g. `/v1/videos` (required when `RUNWAY_USE_REAL=1`)
- `RUNWAY_STATUS_ENDPOINT`: e.g. `/v1/videos/{id}` (required when `RUNWAY_USE_REAL=1`)
- Mapping helpers (dot-paths):
  - `RUNWAY_ID_PATH` (default: `id`)
  - `RUNWAY_STATUS_FIELD` (default: `status`)
  - `RUNWAY_PROGRESS_FIELD` (default: `progress`)
  - `RUNWAY_ARTIFACTS_PATH` (default: `artifacts`)
  - `RUNWAY_ARTIFACT_URL_FIELD` (default: `url`)
  - `RUNWAY_ARTIFACT_CONTENT_TYPE_FIELD` (default: `content_type`)
  - `RUNWAY_ARTIFACT_FILENAME_FIELD` (default: `filename`)
  - `RUNWAY_STATUS_MAP` (JSON map for status strings → queued|running|succeeded|failed)

Similar variables can be added for Luma/Pika when real integrations are implemented.

### Env Vars (Luma)

- `LUMA_API_KEY`, `LUMA_USE_REAL=1`, `LUMA_BASE_URL` (default `https://api.lumalabs.ai`)
- `LUMA_START_ENDPOINT` (default `/v1/videos`)
- `LUMA_STATUS_ENDPOINT` (default `/v1/videos/{id}`)
- Field mappings: `LUMA_ID_PATH`, `LUMA_STATUS_FIELD`, `LUMA_PROGRESS_FIELD`, `LUMA_ARTIFACTS_PATH`, `LUMA_ARTIFACT_URL_FIELD`, `LUMA_ARTIFACT_CONTENT_TYPE_FIELD`, `LUMA_ARTIFACT_FILENAME_FIELD`, `LUMA_STATUS_MAP`

### Env Vars (Pika)

- `PIKA_API_KEY`, `PIKA_USE_REAL=1`, `PIKA_BASE_URL` (default `https://api.pika.art`)
- `PIKA_START_ENDPOINT` (default `/v1/videos`)
- `PIKA_STATUS_ENDPOINT` (default `/v1/videos/{id}`)
- Field mappings: `PIKA_ID_PATH`, `PIKA_STATUS_FIELD`, `PIKA_PROGRESS_FIELD`, `PIKA_ARTIFACTS_PATH`, `PIKA_ARTIFACT_URL_FIELD`, `PIKA_ARTIFACT_CONTENT_TYPE_FIELD`, `PIKA_ARTIFACT_FILENAME_FIELD`, `PIKA_STATUS_MAP`

## CLI

```
video-make --provider=runway --prompt="ocean at sunset" --duration=8 --upload=1 --key-prefix=video/demos
```

- `--upload=1` uploads artifacts via `storage` package (supports local/S3)
- Without upload, saves files in current directory

## Tests (lightweight)

- Stream write to storage:
  - `node ./test/stream-write.test.js`
- Provider simulation artifact check:
  - `node ./test/provider-sim.test.js`

These are simple Node scripts (no Jest) to keep dependencies minimal.
