# Threat Model

## Primary risks

- Malicious generated Python code
- Container breakout attempts
- DoS from long or frequent renders
- Unsafe imports/calls in scripts

## Mitigations implemented

- AST validation denylist
- Docker sandbox execution for render mode
- Network disabled for sandbox container
- CPU/memory/pids/time limits
- Read-only root filesystem, read-only source mount, output-only writable mount, dropped capabilities, and no-new-privileges
- Redis-backed rate limiting middleware on API with in-memory local fallback
- Per-job owner tokens for status and video access

## Remaining hardening

- Strict custom seccomp profile beyond Docker's default profile
- Full per-tenant authentication and policy management
