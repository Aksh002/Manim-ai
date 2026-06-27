# Repository Guidelines

## Project Structure & Module Organization

Manim_AI is a full-stack prompt-to-Manim video platform. Backend code lives in `apps/api/app`, with FastAPI routes in `api/`, schemas in `schemas/`, workers in `workers/`, and shared services in `services/`. Tests are under `apps/api/app/tests` and split into `unit`, `integration`, and `e2e`. The Next.js app lives in `apps/web/src`, with UI components in `components/`, API clients and server helpers in `lib/`, and App Router endpoints in `app/api`. Renderer images and services live in `containers/`; architecture, deployment, and API notes live in `docs/`.

## Build, Test, and Development Commands

- `make up`: builds the renderer image and starts the full Docker Compose stack.
- `make down`: stops the stack and removes orphan containers.
- `make build`: builds all Docker images, including the renderer.
- `make logs`: follows recent Compose logs.
- `make test-api`: runs backend pytest inside Docker.
- `make lint-api`: runs Ruff checks for the API.
- `make test-web` / `make lint-web`: run the web lint/test script inside Docker.
- Local backend check: from `apps/api`, run `python -m pytest`.
- Local web build: from `apps/web`, run `npm run build`.

## Coding Style & Naming Conventions

Python targets 3.11+, uses 4-space indentation, type hints, and Ruff with a 100-character line limit. Keep FastAPI route files named `routes_*.py`, service modules focused, and Pydantic schemas in `schemas/`. TypeScript uses Next.js conventions: PascalCase components, camelCase helpers, and route handlers under `app/api/**/route.ts`. Do not mix generated Manim code policy with sandbox/security policy; security constraints win.

## Testing Guidelines

Use pytest for backend tests. Name files `test_*.py` and keep unit tests close to the changed behavior. Add integration tests for route contracts, queue/job behavior, cache identity, auth, and storage changes. Web tests currently map to linting via `npm run test`; run `npm run build` before shipping UI or type changes.

## Commit & Pull Request Guidelines

Recent commits use short, imperative summaries such as `adding various routes` and `updgrading infra further`. Keep commits concise and scoped. PRs should include what changed, why it changed, how it was tested, and any required env or Docker rebuild steps. Include screenshots or short clips for UI/rendering changes.

## Security & Configuration Tips

Keep `.env` local and update `.env.example` when adding settings. Do not commit API keys, owner tokens, Redis data, or rendered artifacts. Renderer changes usually require rebuilding images. Curated skill guidance is vendored under `apps/api/app/knowledge`; runtime code must not download Skills.sh packages.
