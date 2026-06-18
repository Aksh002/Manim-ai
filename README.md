# Manim AI Platform

AI-assisted Manim animation generation platform with FastAPI + Next.js + Redis/RQ + sandbox rendering.

## Quick Start

1. Copy env file:
   - `cp .env.example .env`
2. Configure the Lightning.ai qwen endpoint in `.env`:
   - `LLM_BASE_URL=<your /v1 or /v1/chat/completions URL>`
   - `LLM_API_KEY=<your token>`
   - `LLM_MODEL=qwen3-coder`
3. Start stack:
   - `make up`
4. Open:
   - Web: `http://localhost:3000`
   - API docs: `http://localhost:8000/docs`

## Modes

- Local render fallback (no queue, host manim):
  - `docker compose -f docker-compose.yml -f infra/compose/compose.dev.yml up --build`
- Docker sandbox render (queue + sandbox):
  - `docker compose build renderer-image`
  - `docker compose up --build`
- Internal renderer service (production-oriented):
  - set `RENDER_MODE=service`
  - `docker compose up --build`

## Architecture

- `apps/web`: Next.js frontend
- `apps/api`: FastAPI API + RQ worker
- `containers/renderer`: Sandbox render image for Manim
- `infra`: deployment/runtime configs
- `docs`: architecture and runbooks

## Production Deployment

- Vercel hosts the Next.js app from `apps/web`.
- Railway hosts the FastAPI API, RQ worker, Redis, Postgres, and renderer service.
- Auth uses Auth.js with Google + GitHub OAuth.
- Users receive free credits and can save encrypted OpenAI-compatible LLM keys.
- Deployment steps are documented in `docs/production-deployment.md`.

## Notes

- Local development can use `AUTH_REQUIRED=false` and owner-token fallback.
- Production should use `AUTH_REQUIRED=true`, `ALLOW_OWNER_TOKEN_FALLBACK=false`, and `RENDER_MODE=service`.
- The LLM layer uses a single OpenAI-compatible chat-completions endpoint, configured by `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL`.
- API contracts are documented in `docs/api-contracts.md`.
- Golden benchmark prompts are in `docs/golden-prompts.json`.
- Benchmark runner: `apps/api/app/tests/e2e/run_benchmark.py`.
- Renderer smoke runner: `apps/api/app/tests/e2e/render_smoke.py`.
