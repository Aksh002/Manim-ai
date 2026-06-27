# Manim AI Handover

This document is intended to give a new agent or developer enough context to understand the current project state without replaying the full conversation. It reflects the repository after the chat-workspace, Auth/BYOK/credits, renderer-service, storage, quality, and skill-guided generation work.

## 1. Product Summary

Manim AI is an AI-assisted educational animation studio. A user describes a lesson, the system plans a storyboard and scene structure, generates Manim CE code, lets the user edit/regenerate the code, renders it asynchronously, repairs failures, and returns MP4/thumbnail artifacts.

The current web product is not a single prompt form anymore. It is a persistent chat-style workspace:

- Left rail: chat sessions and account/queue hints.
- Center: timeline of user prompts, generation events, render events, repair/error events.
- Right workbench: preview, Monaco code editor, render attempts, storyboard/scene plan, settings/BYOK.

The system is still a personal/development-oriented deployment but has production-shaped pieces: Auth.js, Postgres, credits, BYOK, signed artifacts, S3/R2 storage support, renderer service, and internal-token backend protection.

## 2. High-Level Architecture

Main services:

- Web app: [apps/web](apps/web)
- FastAPI API: [apps/api/app/main.py](apps/api/app/main.py)
- RQ worker: [apps/api/app/workers/rq_worker.py](apps/api/app/workers/rq_worker.py)
- Redis queue/state store: `redis` service in [docker-compose.yml](docker-compose.yml)
- Renderer service: [containers/renderer_service](containers/renderer_service)
- Docker renderer image: [containers/renderer](containers/renderer)
- Postgres database: Prisma-owned schema in [apps/web/prisma/schema.prisma](apps/web/prisma/schema.prisma)

Request shape:

```text
Browser
  -> Next.js route handlers under /api/*
  -> FastAPI internal endpoints with x-manim-internal-token and x-manim-user-id
  -> Redis/RQ worker for render jobs
  -> Docker renderer or internal renderer service
  -> local/S3 artifact storage
  -> signed artifact URLs back to browser
```

Important design choice: browser traffic should go through the Next.js proxy, not directly to FastAPI, in production. The proxy handles Auth.js sessions, user identity, credits, BYOK key lookup/decryption, and artifact URL rewriting.

## 3. Web App Current State

The main workspace is implemented in [apps/web/src/app/page.tsx](apps/web/src/app/page.tsx). It is a client component that manages:

- chat loading and switching
- prompt submission
- code version selection/editing
- render draft/final submission
- render polling and repair-code capture
- BYOK provider selection
- credits display
- worker queue health display

Styling is in [apps/web/src/app/globals.css](apps/web/src/app/globals.css). The current visual direction is a dense studio/workbench UI, not a landing page.

Key components:

- [CodeEditor.tsx](apps/web/src/components/CodeEditor.tsx): Monaco editor wrapper.
- [JobStatusBadge.tsx](apps/web/src/components/JobStatusBadge.tsx): status chip/progress text.
- [PromptForm.tsx](apps/web/src/components/PromptForm.tsx): legacy form component retained but no longer central.
- [VideoPlayer.tsx](apps/web/src/components/VideoPlayer.tsx): legacy preview component retained but new page uses inline video preview.

Client API helpers are in [apps/web/src/lib/api-client.ts](apps/web/src/lib/api-client.ts). Shared web types are in [apps/web/src/lib/types.ts](apps/web/src/lib/types.ts).

## 4. Web Server Routes

Next.js API routes are the browser-facing API. Important routes:

- [api/chats/route.ts](apps/web/src/app/api/chats/route.ts): list/create chat sessions.
- [api/chats/[chatId]/route.ts](apps/web/src/app/api/chats/[chatId]/route.ts): load/update/archive one chat.
- [api/chats/[chatId]/messages/route.ts](apps/web/src/app/api/chats/[chatId]/messages/route.ts): persist user prompt, call FastAPI `/generate`, store generation event and code version.
- [api/chats/[chatId]/code-versions/route.ts](apps/web/src/app/api/chats/[chatId]/code-versions/route.ts): save edited/regenerated/repaired code snapshots.
- [api/chats/[chatId]/renders/route.ts](apps/web/src/app/api/chats/[chatId]/renders/route.ts): reserve credit/BYOK quota, enqueue backend render, create session render record.
- [api/chats/[chatId]/renders/[renderId]/pin/route.ts](apps/web/src/app/api/chats/[chatId]/renders/[renderId]/pin/route.ts): pin/unpin render.
- [api/chats/[chatId]/renders/[renderId]/cancel/route.ts](apps/web/src/app/api/chats/[chatId]/renders/[renderId]/cancel/route.ts): cancel backend job for a session render.
- [api/status/[jobId]/route.ts](apps/web/src/app/api/status/[jobId]/route.ts): proxy status, sync credits, sync `SessionRender` metadata.
- [api/generate/route.ts](apps/web/src/app/api/generate/route.ts), [api/render/route.ts](apps/web/src/app/api/render/route.ts), [api/regenerate/route.ts](apps/web/src/app/api/regenerate/route.ts): compatibility routes used by older UI paths and wrappers.
- [api/me/credits](apps/web/src/app/api/me/credits/route.ts): user credit summary.
- [api/me/llm-configs](apps/web/src/app/api/me/llm-configs/route.ts): encrypted BYOK configs.
- [api/artifacts/[jobId]/[kind]](apps/web/src/app/api/artifacts/[jobId]/[kind]/route.ts): signed artifact proxy with Range forwarding.

The central server-side chat persistence helper is [apps/web/src/lib/server/chat-store.ts](apps/web/src/lib/server/chat-store.ts). Read this before modifying chat routes.

## 5. Database And Prisma

Prisma schema: [apps/web/prisma/schema.prisma](apps/web/prisma/schema.prisma)

Major model groups:

Auth.js models:

- `User`
- `Account`
- `Session`
- `VerificationToken`

Credits/BYOK/job models:

- `CreditBalance`
- `CreditLedger`
- `LlmConfig`
- `RenderJob`
- `BenchmarkRun`

Chat workspace models:

- `ChatSession`: user-owned workspace/chat.
- `ChatMessage`: timeline entries, including user prompts, generation events, render events, errors.
- `CodeVersion`: Manim code snapshots with `codeHash`, source type, parent link, metadata.
- `SessionRender`: chat-facing render history linked to code version and backend job.

Prisma client setup: [apps/web/src/lib/server/prisma.ts](apps/web/src/lib/server/prisma.ts)

Important Prisma runtime details:

- `binaryTargets` include `linux-musl-openssl-3.0.x`, `debian-openssl-3.0.x`, and `rhel-openssl-3.0.x` because Docker and deployments may not match Windows.
- Supabase pooler URLs are normalized to include `pgbouncer=true` and `connection_limit=1` to avoid prepared statement collisions such as `prepared statement "s0" already exists`.
- [apps/web/.dockerignore](apps/web/.dockerignore) prevents Windows host `node_modules` from being copied into Linux Docker images.
- [apps/web/Dockerfile](apps/web/Dockerfile) runs `npx prisma generate` inside the container.

Local DB sync:

```powershell
cd apps/web
npx prisma db push
```

If Supabase direct host `db.<project>.supabase.co:5432` is unreachable, use the Supabase session pooler on port `5432`, not transaction pooler `6543`.

## 6. Auth, Local Dev, Credits, BYOK

Auth config: [apps/web/src/auth.ts](apps/web/src/auth.ts)

Current behavior:

- Google/GitHub providers are added only when env vars exist.
- `/api/auth/signin` uses custom page [apps/web/src/app/signin/page.tsx](apps/web/src/app/signin/page.tsx).
- If no providers are configured and `AUTH_REQUIRED=false`, the sign-in page explains local dev fallback.
- Production should set `AUTH_REQUIRED=true` and configure OAuth providers.

Current-user guard: [apps/web/src/lib/server/auth-guard.ts](apps/web/src/lib/server/auth-guard.ts)

- Signed-in users get their Auth.js user id.
- Local dev fallback uses `dev-user`.
- The guard upserts the `dev-user` row and initializes credits before chat records are created, preventing `ChatSession_userId_fkey` violations.

Credits: [apps/web/src/lib/server/credits.ts](apps/web/src/lib/server/credits.ts)

- New users receive `FREE_CREDITS_ON_SIGNUP` credits.
- Render attempts reserve/spend/refund credits.
- BYOK renders bypass free credit spend but are rate-limited by `BYOK_DAILY_RENDER_LIMIT`.
- Status polling finalizes credit spend/refund.

BYOK secrets: [apps/web/src/lib/server/user-secrets.ts](apps/web/src/lib/server/user-secrets.ts)

- Stores OpenAI-compatible provider configs.
- API keys are encrypted at rest with `USER_SECRET_ENCRYPTION_KEY`.
- Decrypted keys are only forwarded internally to FastAPI headers.

## 7. Backend API Current State

FastAPI entrypoint: [apps/api/app/main.py](apps/api/app/main.py)

Routes:

- [routes_generate.py](apps/api/app/api/routes_generate.py): prompt-to-code generation.
- [routes_render.py](apps/api/app/api/routes_render.py): enqueue render job.
- [routes_status.py](apps/api/app/api/routes_status.py): job lifecycle/status.
- [routes_regenerate.py](apps/api/app/api/routes_regenerate.py): instruction-based code regeneration.
- [routes_jobs.py](apps/api/app/api/routes_jobs.py): cancellation.
- [routes_artifacts.py](apps/api/app/api/routes_artifacts.py): signed artifact delivery.
- [routes_workers.py](apps/api/app/api/routes_workers.py): worker/renderer health.
- [routes_video.py](apps/api/app/api/routes_video.py), [routes_thumbnail.py](apps/api/app/api/routes_thumbnail.py): compatibility artifact routes.

Auth boundary:

- Backend accepts internal proxy headers when `x-manim-internal-token` matches `INTERNAL_API_TOKEN`.
- Local owner-token fallback remains for development if `ALLOW_OWNER_TOKEN_FALLBACK=true`.
- Do not expose FastAPI directly in production without proxy/internal token rules.

Important backend services:

- [job_service.py](apps/api/app/services/job_service.py): Redis job records, status, ownership/cancel flags.
- [queue_service.py](apps/api/app/services/queue_service.py): Redis/RQ enqueue abstraction.
- [storage_service.py](apps/api/app/services/storage_service.py): local/S3 storage adapter.
- [artifact_signing.py](apps/api/app/services/artifact_signing.py): signed artifact URL creation/validation.
- [range_response.py](apps/api/app/services/range_response.py): video seeking/range support.
- [database.py](apps/api/app/services/database.py): backend SQL access for Prisma-owned tables where needed.

## 8. LLM And Generation Pipeline

LLM service: [apps/api/app/services/llm_service.py](apps/api/app/services/llm_service.py)

The LLM layer is OpenAI-compatible. It supports:

- Platform provider from env: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`.
- Per-request BYOK provider config from internal proxy headers.
- Base URL normalization for `/v1/chat/completions` style endpoints.
- Structured generation mode by default.

Structured generation stages:

1. `storyboard`: JSON storyboard with educational beats, hook, misconception, visual metaphor, aha moment.
2. `scene_plan`: JSON Manim implementation plan with objects, timings, layout, transitions, formulas, risks.
3. `planner_critic`: optional revision if plan score is below `PLANNER_CRITIC_THRESHOLD`.
4. `code`: complete Manim CE code targeting `GeneratedScene`.
5. Repair/regenerate prompts use curated repair/code fragments.

Prompt/skill support:

- Prompt builder: [prompt_builder.py](apps/api/app/services/prompt_builder.py)
- Skill registry: [skill_registry.py](apps/api/app/services/skill_registry.py)
- Knowledge manifest: [apps/api/app/knowledge/manim/manifest.json](apps/api/app/knowledge/manim/manifest.json)
- Knowledge fragments:
  - [manimce_code_contract.md](apps/api/app/knowledge/manim/fragments/manimce_code_contract.md)
  - [quality_repair_rules.md](apps/api/app/knowledge/manim/fragments/quality_repair_rules.md)
  - [storyboard_narrative_arcs.md](apps/api/app/knowledge/manim/fragments/storyboard_narrative_arcs.md)
  - [visual_design_principles.md](apps/api/app/knowledge/manim/fragments/visual_design_principles.md)

The runtime does not automatically download external Skills packages. It uses curated local knowledge fragments derived from earlier skill-planning work.

Generation responses include metadata such as `storyboard`, `storyboard_document`, `scene_plan`, `planning_report`, `skill_provenance`, `generation_attempts`, and `manim_version`.

## 9. Validation, Repair, Quality, And Errors

Static validation: [code_validator.py](apps/api/app/services/code_validator.py)

- Enforces a Manim contract, especially `GeneratedScene(Scene)`.
- Blocks unsafe imports/calls as defense-in-depth.
- It is not treated as the security boundary; the sandbox/renderer isolation is.

Deterministic repair: [code_repairer.py](apps/api/app/services/code_repairer.py)

- Repairs common deterministic failures before LLM repair.
- Handles patterns such as bad `Tex(...)`, excessive waits/run times, unsupported helpers, malformed contract problems.

Error classification: [error_classifier.py](apps/api/app/services/error_classifier.py)

- Categorizes validation, LaTeX, Manim API, timeout, sandbox, missing dependency, and unknown failures.

Quality evaluation: [quality_service.py](apps/api/app/services/quality_service.py)

- Uses ffmpeg/ffprobe-style checks when available.
- Tracks existence, duration, resolution, blank/motion heuristics, file size, score/pass/fail.

Render worker loop: [tasks_render.py](apps/api/app/workers/tasks_render.py)

- Validates code.
- Runs deterministic repair.
- Renders via orchestrator.
- Applies LLM repair on failures when allowed.
- Records attempts, final code, errors, quality report, and artifact metadata.

## 10. Rendering And Sandboxing

Render orchestrator: [render_orchestrator.py](apps/api/app/services/render_orchestrator.py)

Modes:

- `docker`: uses [docker_runner.py](apps/api/app/sandbox/docker_runner.py) and `manim-ai-renderer:latest`.
- `service`: uses [renderer_service_client.py](apps/api/app/services/renderer_service_client.py) and internal service at `RENDERER_SERVICE_URL`.
- `local`: direct host `manim` fallback for developer convenience.

Docker sandbox renderer:

- Image: [containers/renderer/Dockerfile](containers/renderer/Dockerfile)
- Entrypoint: [containers/renderer/entrypoint.sh](containers/renderer/entrypoint.sh)
- Intended hardening: no network, read-only root, tmpfs workspace/output/cache, CPU/memory/PID limits, cap drop, no-new-privileges, seccomp when configured.

Renderer service:

- App: [containers/renderer_service/app.py](containers/renderer_service/app.py)
- Dockerfile: [containers/renderer_service/Dockerfile](containers/renderer_service/Dockerfile)
- Used by `RENDER_MODE=service`.
- Supports render, cancel, and health checks.

Default local Docker Compose currently sets `RENDER_MODE=docker` in env examples, but [docker-compose.yml](docker-compose.yml) also runs the renderer service. Production-oriented deployments should prefer `RENDER_MODE=service` and avoid mounting Docker socket into worker.

## 11. Storage And Artifact Delivery

Storage service: [storage_service.py](apps/api/app/services/storage_service.py)

Supported backends:

- `STORAGE_BACKEND=local`: stores files under `VIDEO_STORAGE_ROOT`.
- `STORAGE_BACKEND=s3`: S3/R2-compatible backend using configured endpoint/bucket/keys.

Artifact delivery:

- Signed URLs are generated using [artifact_signing.py](apps/api/app/services/artifact_signing.py).
- `/status/{job_id}` returns `video_url`, `thumbnail_url`, `artifact_metadata`, `artifact_expires_at` when available.
- Next proxy rewrites `/artifacts/...` backend URLs to `/api/artifacts/...` in [backend-proxy.ts](apps/web/src/lib/server/backend-proxy.ts).
- Range requests are forwarded to support video seeking.

Current caveat: draft/final/pinned render retention metadata exists in the web workspace, but cleanup is not yet fully differentiated by render target and pin state.

## 12. Docker And Deployment

Main compose: [docker-compose.yml](docker-compose.yml)

Services:

- `web`: Next.js dev server in Docker.
- `api`: FastAPI.
- `worker`: RQ worker.
- `renderer`: internal renderer service.
- `redis`: Redis.
- `renderer-image`: build-only profile for sandbox image.

Web Dockerfile: [apps/web/Dockerfile](apps/web/Dockerfile)

Important fixes already applied:

- Installs `openssl` in Alpine.
- Copies Prisma schema before `npm install`.
- Runs `npx prisma generate` inside Linux container.
- Uses [apps/web/.dockerignore](apps/web/.dockerignore) to avoid copying Windows `node_modules` into Linux.

Production docs:

- [docs/production-deployment.md](docs/production-deployment.md)
- [infra/compose/compose.prod.yml](infra/compose/compose.prod.yml)
- [apps/web/vercel.json](apps/web/vercel.json)

Planned deployment shape:

- Vercel for `apps/web`.
- Railway or equivalent for FastAPI, worker, Redis, Postgres, renderer service.
- S3/R2 for production artifacts.
- `AUTH_REQUIRED=true`, real OAuth, `ALLOW_OWNER_TOKEN_FALLBACK=false`, `RENDER_MODE=service`.

## 13. Environment Variables

Root `.env` is used by Docker Compose and backend containers. `apps/web/.env` is used by Prisma CLI and local web commands.

Important root envs:

- LLM: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, token limits.
- Auth: `AUTH_REQUIRED`, `AUTH_SECRET`, `AUTH_URL`, OAuth provider ids/secrets.
- Internal auth: `INTERNAL_API_TOKEN`, `ALLOW_OWNER_TOKEN_FALLBACK`.
- Database: `DATABASE_URL`.
- Redis: `REDIS_URL`, `USE_QUEUE`.
- BYOK/credits: `FREE_CREDITS_ON_SIGNUP`, `BYOK_DAILY_RENDER_LIMIT`, `USER_SECRET_ENCRYPTION_KEY`.
- Storage/artifacts: `STORAGE_BACKEND`, S3/R2 vars, `ARTIFACT_SIGNING_SECRET`, TTL/retention vars.
- Rendering: `RENDER_MODE`, `RENDERER_SERVICE_URL`, `RENDERER_IMAGE`, `MANIM_VERSION`, sandbox limits.
- Skill/generation: policy versions, `GENERATION_PIPELINE_MODE`, `SKILL_CONTEXT_MAX_CHARS`, planner critic settings.

Known env pitfalls:

- Do not commit `.env` or `apps/web/.env`.
- Docker Compose interpolates `$` inside `.env`; raw passwords containing `$H` can trigger `The "H" variable is not set`. Use URL encoding in URLs or escape raw `$` as `$$`.
- Supabase transaction pooler port `6543` is problematic for Prisma schema work and can hang. Prefer direct DB or session pooler port `5432`.
- For Supabase pooler runtime, ensure Prisma URL handling keeps `pgbouncer=true` and `connection_limit=1`.

## 14. Local Runbook

Fresh setup:

```powershell
copy .env.example .env
# edit .env and apps/web/.env
cd apps/web
npx prisma db push
cd ..\..
docker compose build renderer-image
docker compose up --build
```

Open:

- Web: http://localhost:3000
- Sign-in/dev auth: http://localhost:3000/signin
- API docs: http://localhost:8000/docs

Useful checks:

```powershell
cd apps/web
npm run build
npx prisma generate

cd ..\..
docker compose build web
docker compose config
docker compose ps

cd apps/api
python -m pytest
python app/tests/e2e/render_smoke.py
python app/tests/e2e/run_benchmark.py
```

Cache clearing examples:

```powershell
# Redis render/generation cache if using docker redis
docker compose exec redis redis-cli FLUSHDB
```

## 15. Tests And Verification State

Existing API tests include:

- Unit tests for validator, repairer, docker runner, artifact signing, range response, render cache, error classifier, skill registry.
- Integration tests for generate route, internal auth, job control, render/status routes.
- E2E scripts for render smoke and benchmark prompts.

Web verification used recently:

```powershell
cd apps/web
npm run build
```

Docker verification used recently:

```powershell
docker compose build web
```

Current gap: there are not yet dedicated tests for the new chat workspace API routes, chat persistence behavior, pinning, or UI interactions.

## 16. Recent Problems Fixed

These are important because they are likely to recur if env/Docker changes regress.

1. Prisma did not load `.env.local` for CLI.
   - Fix: put `DATABASE_URL` in `apps/web/.env` for Prisma CLI.

2. Supabase direct DB host was unreachable.
   - Fix: use session pooler if direct host fails.

3. Prisma engine mismatch in Docker.
   - Error: generated for Windows, runtime required `linux-musl`.
   - Fix: add Prisma binary targets and generate inside Docker.

4. Prisma OpenSSL mismatch in Alpine.
   - Error: `libssl.so.1.1` missing.
   - Fix: use `linux-musl-openssl-3.0.x`, install `openssl`, avoid host `node_modules` copy.

5. Chat foreign key failure for local dev.
   - Error: `ChatSession_userId_fkey`.
   - Fix: [auth-guard.ts](apps/web/src/lib/server/auth-guard.ts) upserts `dev-user` before chat creation.

6. Supabase pooler prepared statement collision.
   - Error: `prepared statement "s0" already exists`.
   - Fix: [prisma.ts](apps/web/src/lib/server/prisma.ts) appends `pgbouncer=true` and `connection_limit=1` for pooler URLs.

7. Blank Auth.js sign-in page.
   - Cause: no OAuth providers configured.
   - Fix: custom `/signin` page explains dev fallback and renders provider buttons when configured.

## 17. Known Remaining Work

High priority:

- Add automated tests for `/api/chats/*` route ownership and persistence.
- Add UI smoke tests for chat switching, prompt generation, code save, draft render, status polling, repaired-code capture.
- Make cleanup retention target-aware: drafts expire quickly, finals longer, pinned renders retained.
- Add database migrations instead of relying only on `prisma db push` for production.
- Upgrade Next.js from `15.0.0` because npm warns about a security advisory.

Production hardening:

- Use `RENDER_MODE=service` and remove Docker socket from worker in production.
- Ensure `AUTH_REQUIRED=true`, configured OAuth, strong `AUTH_SECRET`, strong `INTERNAL_API_TOKEN`, strong `USER_SECRET_ENCRYPTION_KEY`, strong `ARTIFACT_SIGNING_SECRET`.
- Use S3/R2 storage for artifacts.
- Review threat model after renderer service rollout.
- Add monitoring/Sentry/OpenTelemetry hooks.

Product quality:

- Add render history filtering and explicit expired artifact UI.
- Add side-by-side original/repaired code diff.
- Improve mobile layout for the three-pane workspace.
- Add quality score trends and benchmark dashboard improvements.

## 18. Suggested Read Order For A New Agent

1. [README.md](README.md)
2. This file: [handover.md](handover.md)
3. [apps/web/src/app/page.tsx](apps/web/src/app/page.tsx)
4. [apps/web/src/lib/server/chat-store.ts](apps/web/src/lib/server/chat-store.ts)
5. [apps/web/prisma/schema.prisma](apps/web/prisma/schema.prisma)
6. [apps/web/src/lib/server/backend-proxy.ts](apps/web/src/lib/server/backend-proxy.ts)
7. [apps/api/app/api/routes_generate.py](apps/api/app/api/routes_generate.py)
8. [apps/api/app/services/llm_service.py](apps/api/app/services/llm_service.py)
9. [apps/api/app/workers/tasks_render.py](apps/api/app/workers/tasks_render.py)
10. [apps/api/app/services/render_orchestrator.py](apps/api/app/services/render_orchestrator.py)
11. [apps/api/app/services/storage_service.py](apps/api/app/services/storage_service.py)
12. [docs/api-contracts.md](docs/api-contracts.md)
13. [docs/production-deployment.md](docs/production-deployment.md)

## 19. Mental Model

Think of the system as two coupled but separate products:

1. The web studio owns user/product state: auth, credits, chats, messages, code versions, render records, BYOK configs, and user-facing workflow.
2. The FastAPI backend owns AI/render execution: LLM prompting, validation, repair, queueing, sandbox rendering, artifact storage, and job status.

The bridge between them is the Next.js proxy layer. Avoid bypassing it in production, because that is where user identity, BYOK selection, credit reservation, and artifact URL rewriting happen.
