# Runbook

## Local

1. Copy `.env.example` to `.env`
2. Configure the Lightning.ai qwen endpoint in `.env`:
   - `LLM_BASE_URL=<your /v1 or /v1/chat/completions URL>`
   - `LLM_API_KEY=<token>`
   - `LLM_MODEL=qwen3-coder`
3. Sync the web database schema after Prisma model changes:
   - `cd apps/web`
   - `npx prisma db push`
4. Build renderer image:
   - `docker compose build renderer-image`
5. Start stack:
   - `make up`
6. Run benchmark:
   - `python apps/api/app/tests/e2e/run_benchmark.py`
7. Run renderer smoke after building `renderer-image`:
   - `cd apps/api`
   - `python app/tests/e2e/render_smoke.py`

## Production VM

1. Install Docker + Compose plugin
2. Configure `.env`
3. Start with prod compose:
   - `docker compose -f docker-compose.yml -f infra/compose/compose.prod.yml up -d`
4. Scale workers:
   - `docker compose up -d --scale worker=4`
