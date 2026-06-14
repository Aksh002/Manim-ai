# Architecture

## Services

- Web (`apps/web`): Next.js UI for prompt/code/render/preview.
- API (`apps/api`): FastAPI endpoints and orchestration.
- Redis: queue + shared state backend.
- Worker (`apps/api/app/workers`): RQ render executor.
- Renderer (`containers/renderer`): sandbox runtime image for Manim render.

## Phase 1 MVP Flow

```text
[Next.js UI]
   |  POST /generate
   v
[FastAPI API] --(OpenAI-compatible chat completions)-> [Lightning qwen3-coder]
   |  returns manim code
   |  POST /render
   v
[Render Service]
   | manim render (local mode)
   v
[Local Storage: /data/videos/{job_id}.mp4]
   ^
   | GET /video/{job_id}
[Next.js UI]
```

## Phase 2+ Secure Flow

```text
[Next.js UI]
   | generate/render/status/video
   v
[FastAPI API] <-> [Redis]
                  ^
                  | dequeue jobs
               [RQ Worker]
                  |
                  v
         [Sandbox Renderer Container]
          - no network
          - read-only root fs
          - cpu/memory/pids/time limits
                  |
                  v
         [Storage Adapter (local -> S3)]
```

## Data flow

1. User submits prompt to `/generate`.
2. LLM returns Manim code.
3. User submits code to `/render`.
4. API enqueues job in RQ.
5. Worker validates and executes in sandbox container.
6. Video stored locally and exposed by `/video/{job_id}`.
