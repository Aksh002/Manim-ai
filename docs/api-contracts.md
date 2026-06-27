# API Contracts

Production browser traffic calls the Next.js proxy under `/api/*`. The proxy validates Auth.js
sessions, manages credits/BYOK, and calls FastAPI with `x-manim-internal-token`,
`x-manim-user-id`, and optional internal BYOK headers. Direct owner-token access is only for local
development when `ALLOW_OWNER_TOKEN_FALLBACK=true`.

## POST /generate
Input: topic, duration_seconds, style, level, additional_instructions, optional llm_config_id via Next proxy
Output: code, model, source (`llm`, `fallback`, or `cache`), warnings, optional storyboard, storyboard_document, scene_plan, planning_report, skill_provenance, manim_version, and generation_attempts

## POST /render
Input: code, quality (`1080p30`, `720p30`, or `480p15`), retry_on_error, preview_first, target, optional llm_config_id via Next proxy
Output: job_id, status, owner_token

## POST /regenerate
Input: code, instruction
Output: revised code

## GET /status/{job_id}
Input: authenticated Next proxy session, or local owner_token fallback
Output: job lifecycle status, progress, error_type, error_summary, repair attempts,
artifact metadata, code hash, signed video_url/thumbnail_url when available, and final code when applicable

## POST /jobs/{job_id}/cancel
Input: authenticated Next proxy session, or local owner_token fallback
Output: updated job lifecycle status

## GET /artifacts/{job_id}/{kind}
Input: signed artifact URL plus authenticated Next proxy session for user-owned jobs
Returns rendered MP4 or JPEG thumbnail

## GET /api/me/credits
Next proxy only. Returns current free credit balance.

## GET/POST/DELETE /api/me/llm-configs
Next proxy only. Manages encrypted OpenAI-compatible BYOK configs. Decrypted API keys are never returned.
## Chat Workspace Routes

These routes are Next.js proxy routes backed by Prisma/Postgres and require the same Auth.js session or local dev fallback as the rest of the web API.

- `GET /api/chats`: list user-owned chat sessions by recent activity.
- `POST /api/chats`: create a persistent chat session.
- `GET/PATCH/DELETE /api/chats/{chatId}`: load, rename/update, or archive a chat.
- `POST /api/chats/{chatId}/messages`: store a user prompt, call `/generate`, store the assistant event, and create the active code version.
- `POST /api/chats/{chatId}/code-versions`: save edited, regenerated, or repaired Manim code as a versioned snapshot.
- `POST /api/chats/{chatId}/renders`: create a session render record, reserve credits, enqueue backend rendering, and link the backend job.
- `POST /api/chats/{chatId}/renders/{renderId}/pin`: retain or unpin an important render in the workspace.
- `POST /api/chats/{chatId}/renders/{renderId}/cancel`: cancel the linked backend job when possible.


