Alii Fish Market Agent Stack (Monorepo)

Overview
- Slack-operated agent system deployed on Render.
- Public landing at `https://alii-website.onrender.com` (Next.js).
- Secure portal/API (Express/TypeScript) with UPP integration for payments.
- Background worker for media generation, invoices, mirroring tasks.
- Slack bot (Bolt for JS) for slash commands and event-driven orchestration.

Services
- apps/web-frontend: Next.js landing/portal shell (mirrored content scaffolding).
- services/api-backend: Express API (auth, RBAC hooks, UPP webhooks, audit log).
- services/slack-bot: Slack commands and dispatcher → enqueue jobs.
- services/worker: Background worker for long-running tasks.
- services/orchestrator: n8n (external image) or simple orchestrator stubs.
- packages/upp-client: Typed client for Universal Payment Protocol.
- packages/job-queue: Minimal job queue abstraction (HTTP → DB/Redis later).

Render Targets
- Web services: web-frontend, api-backend, slack-bot, orchestrator.
- Background worker: worker.
- Managed Postgres; S3-compatible object storage.

Local Development
1) Node 20.x, pnpm or npm supported. Example:
   - npm install
   - npm run build
   - npm run dev:api (API), npm run dev:bot (Slack), npm run dev:worker (Worker)
2) Environment variables: see `.env.example` and render/blueprints for all variables.

Slack Commands (stubs wired)
- /aliifm deploy
- /aliifm mirror [url]
- /aliifm video make --sku=<id> --count=10 --style=vertical --duration=15s
- /aliifm invoice create --customer=<email> --items=<...>
- /aliifm task status <id>
- /aliifm pos plan

Acceptance Path
- Provision Render using blueprints under `render/blueprints/*`.
- Configure Slack app with slash commands targeting `services/slack-bot` URLs.
- Point custom domain `realconnect.online` to control-plane web service as needed.

Notes
- This is a scaffold to unblock CI/CD and provisioning. Replace placeholders
  with production logic and hook up storage, UPP, and orchestrator.

