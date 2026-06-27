# Manim AI Platform

Manim AI is a full-stack prompt-to-video platform for educational animations. It turns a natural-language topic into structured storyboard/scene planning, Manim CE Python code, editable code versions, asynchronous renders, repair attempts, and downloadable MP4 previews.

The current product is a chat-style creative workspace: each chat stores prompts, generated code, code edits, render attempts, repaired code, storyboard metadata, and video artifacts.

## What It Does

- Generates Manim CE code from educational prompts using an OpenAI-compatible LLM endpoint.
- Uses a structured generation pipeline: storyboard -> scene plan -> code -> validation/repair.
- Provides a Next.js chat workspace with a Monaco code editor and video preview workbench.
- Persists chats, code versions, render records, credits, BYOK LLM configs, and Auth.js sessions in Postgres via Prisma.
- Queues renders through FastAPI + Redis/RQ and runs Manim in a sandboxed Docker renderer or internal renderer service.
- Stores local or S3/R2-compatible artifacts and serves signed video/thumbnail URLs.
- Supports free credits and encrypted user-provided OpenAI-compatible API keys.

## Tech Stack

- Web: Next.js 15, React, TypeScript, Monaco, Auth.js, Prisma
- API: FastAPI, Pydantic, Python, Redis, RQ
- Rendering: Manim CE, Docker sandbox renderer, optional internal renderer service
- Storage: local filesystem by default, S3/R2-compatible backend supported
- Database: Postgres, tested with Supabase pooler/session connections
- LLM: OpenAI-compatible chat-completions endpoint, currently configured for Lightning.ai Qwen-style endpoints

## Repository Layout

- [apps/web](apps/web): Next.js app, Auth.js, Prisma schema, chat workspace UI, API proxy routes
- [apps/api](apps/api): FastAPI API, LLM service, render orchestration, job state, storage, workers, tests
- [containers/renderer](containers/renderer): Docker image used by sandboxed Manim rendering
- [containers/renderer_service](containers/renderer_service): internal renderer service image/API
- [infra](infra): compose overrides, nginx/systemd examples
- [docs](docs): architecture, API contracts, production deployment, runbooks, generation quality notes
- [handover.md](handover.md): detailed current-state guide for a new agent/session

## Local Setup

1. Copy environment template:

```powershell
copy .env.example .env
```

2. Configure the root `.env` for Docker Compose:

```env
LLM_BASE_URL=<your OpenAI-compatible /v1 endpoint>
LLM_API_KEY=<your key>
LLM_MODEL=qwen3-coder
DATABASE_URL=<postgres connection string>
AUTH_REQUIRED=false
RENDER_MODE=docker
REDIS_URL=redis://redis:6379/0
```

3. Configure the web Prisma environment in [apps/web/.env](apps/web/.env) for local Prisma CLI commands:

```env
DATABASE_URL=<same postgres connection string>
```

4. Push Prisma schema:

```powershell
cd apps/web
npx prisma db push
cd ..\..
```

5. Build the renderer image if using Docker sandbox mode:

```powershell
docker compose build renderer-image
```

6. Start the stack:

```powershell
docker compose up --build
```

Open:

- Web: http://localhost:3000
- API docs: http://localhost:8000/docs
- Sign-in/dev auth status: http://localhost:3000/signin

## Supabase Notes

For Prisma schema pushes, direct database URLs are ideal. If direct `db.<project>.supabase.co:5432` is unreachable from your network, use Supabase session pooler on port `5432`, not transaction pooler `6543`.

For app runtime with Supabase pooler, this project normalizes Prisma URLs in [apps/web/src/lib/server/prisma.ts](apps/web/src/lib/server/prisma.ts) by adding `pgbouncer=true` and `connection_limit=1` to reduce prepared-statement collisions.

If Docker Compose warns that a variable like `H` is missing, a root `.env` value contains a raw `$`. Escape it as `$$` or use URL-encoded values such as `%24` inside `DATABASE_URL`.

## Development Commands

Web:

```powershell
cd apps/web
npm run dev
npm run build
npx prisma generate
npx prisma db push
```

API:

```powershell
cd apps/api
python -m pytest
python app/tests/e2e/render_smoke.py
python app/tests/e2e/run_benchmark.py
```

Docker:

```powershell
docker compose config
docker compose build web
docker compose build renderer-image
docker compose up --build
```

## Main Workflows

1. User opens chat workspace in [apps/web/src/app/page.tsx](apps/web/src/app/page.tsx).
2. Browser calls Next proxy routes in [apps/web/src/app/api](apps/web/src/app/api).
3. Next validates local/Auth.js user, manages credits/BYOK, and forwards internal calls to FastAPI.
4. FastAPI generates code through [llm_service.py](apps/api/app/services/llm_service.py) and curated Manim knowledge fragments.
5. Render requests are stored as jobs, queued through Redis/RQ, validated, repaired, rendered, stored, and exposed via signed URLs.
6. The chat workspace stores each prompt, code version, render record, status update, and repaired code in Postgres.

## Authentication And Local Dev

Auth.js is configured in [apps/web/src/auth.ts](apps/web/src/auth.ts). In production, configure Google/GitHub OAuth and set `AUTH_REQUIRED=true`.

For local development, `AUTH_REQUIRED=false` enables a `dev-user` fallback. [auth-guard.ts](apps/web/src/lib/server/auth-guard.ts) ensures the `dev-user` row and credit balance exist before chat records are inserted.

## Rendering Modes

- `RENDER_MODE=docker`: worker uses [DockerRunner](apps/api/app/sandbox/docker_runner.py) and `manim-ai-renderer:latest`.
- `RENDER_MODE=service`: worker calls the internal renderer service in [containers/renderer_service](containers/renderer_service).
- `RENDER_MODE=local`: fallback developer path, less production-like.

Secure production should prefer `RENDER_MODE=service` and keep the worker away from the Docker socket.

## Docs

- [handover.md](handover.md): detailed implementation guide for future agents
- [docs/api-contracts.md](docs/api-contracts.md): external/internal route contracts
- [docs/architecture.md](docs/architecture.md): high-level service architecture
- [docs/production-deployment.md](docs/production-deployment.md): Vercel/Railway-oriented deployment notes
- [docs/runbooks.md](docs/runbooks.md): local and production runbook
- [docs/generation-quality.md](docs/generation-quality.md): skill-guided generation notes
- [docs/threat-model.md](docs/threat-model.md): sandbox/security model

## Current Caveats

- The chat workspace is implemented and build-safe, but automated tests for new chat routes are still a follow-up.
- Draft/final/pinned render retention metadata exists, but cleanup policy is not yet fully differentiated by render target and pin state.
- Auth providers are optional locally; production needs real OAuth env values.
- The Next.js version currently used has npm audit warnings; upgrade planning is recommended before public deployment.
