# Production Deployment

Manim_AI is deployed as a split system:

- Vercel hosts `apps/web`.
- Railway hosts the FastAPI API, RQ worker, Redis, Postgres, and internal renderer service.
- S3/R2-compatible object storage stores videos and thumbnails in production.

## Vercel Web App

Create a Vercel project with:

- Root Directory: `apps/web`
- Build Command: `npm run build`
- Framework: Next.js

Required Vercel environment variables:

- `AUTH_REQUIRED=true`
- `AUTH_SECRET`
- `AUTH_URL=https://your-vercel-domain`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `AUTH_GITHUB_ID`
- `AUTH_GITHUB_SECRET`
- `DATABASE_URL`
- `INTERNAL_API_BASE=https://your-railway-api-domain`
- `INTERNAL_API_TOKEN`
- `USER_SECRET_ENCRYPTION_KEY`
- `FREE_CREDITS_ON_SIGNUP=5`

OAuth callback URLs:

- Google: `https://your-vercel-domain/api/auth/callback/google`
- GitHub: `https://your-vercel-domain/api/auth/callback/github`

## Railway Backend

Create these Railway services:

- `api`: build from `apps/api/Dockerfile`, command from Dockerfile.
- `worker`: build from `apps/api/Dockerfile`, command `python -m app.workers.rq_worker`.
- `renderer`: build from `containers/renderer_service/Dockerfile`.
- Managed Redis.
- Managed Postgres.

Production backend environment:

- `RENDER_MODE=service`
- `RENDERER_SERVICE_URL=http://renderer:8100`
- `ALLOW_OWNER_TOKEN_FALLBACK=false`
- `INTERNAL_API_TOKEN` matching Vercel.
- `DATABASE_URL` matching Railway Postgres.
- `REDIS_URL` matching Railway Redis.
- `STORAGE_BACKEND=s3`
- `S3_ENDPOINT_URL`
- `S3_BUCKET`
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `ARTIFACT_SIGNING_SECRET`
- `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` for the platform provider.

## Database

Prisma owns migrations from `apps/web/prisma/schema.prisma`.

Initial setup:

```powershell
cd apps/web
npx prisma migrate deploy
```

For local schema changes:

```powershell
cd apps/web
npx prisma migrate dev --name your_change_name
```

## Credits And BYOK

New users receive `FREE_CREDITS_ON_SIGNUP` credits. A platform render reserves one credit. Completed renders spend it; cancelled, timed out, or sandbox-failed renders are refunded.

Users can save OpenAI-compatible LLM configs in the web app. API keys are encrypted with `USER_SECRET_ENCRYPTION_KEY` and only sent server-to-server from Vercel to FastAPI.

## Local Development

For local development without OAuth/Postgres:

```env
AUTH_REQUIRED=false
ALLOW_OWNER_TOKEN_FALLBACK=true
STORAGE_BACKEND=local
RENDER_MODE=docker
```

For production-like local testing:

```env
AUTH_REQUIRED=true
ALLOW_OWNER_TOKEN_FALLBACK=false
DATABASE_URL=postgresql://...
INTERNAL_API_TOKEN=...
USER_SECRET_ENCRYPTION_KEY=...
```

## Production Compose Smoke

Use the production compose file to validate service shape:

```powershell
docker compose -f docker-compose.prod.yml config --services
```
