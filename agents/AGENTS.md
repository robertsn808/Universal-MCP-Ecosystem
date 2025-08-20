# Repository Guidelines

## Project Structure & Module Organization
- `agentic-runner/`: TypeScript service exposing an Express API to orchestrate Claude Code sessions. Source in `services/runner/`, helper scripts in `scripts/`, build output in `dist/`.
- `adk-samples/`: Sample agents (Java/Python) and docs; not part of the Node build.
- `.claude/`: Local IDE/agent settings for development.
- `venv/`: Local Python virtual environment (tools only; not required to build/run the Node service).

## Build, Test, and Development Commands
- Install: `cd agentic-runner && npm install` — install Node dependencies.
- Dev server: `npm run dev` — run API from TypeScript via `ts-node`.
- Build: `npm run build` — compile to `dist/` with `tsc`.
- Start built server: `npm start` — run compiled `dist/services/runner/main.js`.
- MCP setup (optional): `npm run setup:mcp` — initialize Model Context Protocol helpers.
- Basic smoke tests: `node ./test-runner.js` (from `agentic-runner/`).

## Coding Style & Naming Conventions
- Language: TypeScript (strict mode). Use double quotes and semicolons to match existing files.
- Indentation: 2 spaces. Line length ~100–120.
- Naming: `kebab-case` for filenames (e.g., `confirmation-handler.ts`), `PascalCase` for classes, `camelCase` for variables/functions.
- Imports: prefer relative paths within `services/runner/`; keep module boundaries clear (`services/**/*`, `scripts/**/*`).

## Testing Guidelines
- Scope: lightweight endpoint checks and basic task flows using `test-runner.js`.
- Add new checks near runner features (health check, task execution, confirmations).
- Run locally with the dev server; mock external calls where feasible.

## Commit & Pull Request Guidelines
- Commits: use imperative mood and Conventional Commits when possible (e.g., `feat: add risk assessment`, `fix: handle missing repoPath`).
- PRs: include summary, rationale, screenshots or `curl` examples for API changes, and steps to validate (commands used and expected output).
- Link issues, keep changes scoped, and ensure `npm run build` passes.

## Security & Configuration Tips
- Configure via `.env` (see `agentic-runner/.env.example`): set `ANTHROPIC_API_KEY`, optional `PORT`.
- Review `agentic-runner/safety-config.json` (allow/block paths and commands) before enabling write actions.
- Do not commit secrets or local artifacts (e.g., `.env`, `dist/`).

