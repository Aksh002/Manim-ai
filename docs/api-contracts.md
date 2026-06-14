# API Contracts

## POST /generate
Input: topic, duration_seconds, style, level, additional_instructions
Output: code, model, source (`llm`, `fallback`, or `cache`), warnings

## POST /render
Input: code, quality (`1080p30`, `720p30`, or `480p15`), retry_on_error
Output: job_id, status, owner_token

## POST /regenerate
Input: code, instruction
Output: revised code

## GET /status/{job_id}
Input: owner_token query parameter or `x-manim-owner-token` header
Output: job lifecycle status, progress, repair metadata, and final code when applicable

## GET /video/{job_id}
Input: owner_token query parameter or `x-manim-owner-token` header
Returns rendered MP4 stream
