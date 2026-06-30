from __future__ import annotations

import argparse
import logging
import time
from datetime import UTC, datetime, timedelta
from typing import Any

from app.core.config import get_settings
from app.services.database import SessionRenderRow, session_scope
from app.services.job_service import JobService
from app.services.storage_service import StorageService

logger = logging.getLogger(__name__)


def run_cleanup_once() -> dict[str, int]:
    settings = get_settings()
    jobs = JobService()
    storage = StorageService()
    candidate_retention_hours = min(
        settings.job_retention_hours,
        settings.artifact_retention_hours,
        settings.draft_render_retention_hours,
        settings.final_render_retention_hours,
    )
    expired_job_ids = jobs.expired_job_ids(candidate_retention_hours)
    deleted_jobs = 0
    deleted_artifacts = 0
    retained_pinned = 0
    retained_policy = 0

    for job_id in expired_job_ids:
        job = jobs.get_job(job_id)
        render = _get_session_render(job_id)
        if render:
            if render.get("pinned"):
                retained_pinned += 1
                continue
            if not _render_is_expired(render, settings):
                retained_policy += 1
                continue
        elif not _should_delete_job(job, settings):
            retained_policy += 1
            continue
        try:
            storage.delete(job_id)
            deleted_artifacts += 1
        except Exception:
            logger.exception("Failed to delete artifacts for %s", job_id)
        if render:
            _mark_render_artifact_deleted(job_id)
        jobs.delete_job(job_id)
        deleted_jobs += 1

    return {
        "deleted_jobs": deleted_jobs,
        "deleted_artifacts": deleted_artifacts,
        "retained_pinned": retained_pinned,
        "retained_policy": retained_policy,
    }


def _should_delete_job(job: dict[str, Any] | None, settings: Any) -> bool:
    if not job:
        return False
    created_at = _parse_datetime(job.get("created_at"))
    if not created_at:
        return True
    return created_at <= datetime.now(UTC) - timedelta(hours=settings.job_retention_hours)


def _render_is_expired(render: dict[str, Any], settings: Any) -> bool:
    created_at = _parse_datetime(render.get("created_at"))
    if not created_at:
        return True
    target = render.get("target")
    retention_hours = (
        settings.draft_render_retention_hours
        if target == "draft"
        else settings.final_render_retention_hours
    )
    artifact_expires_at = _parse_datetime(render.get("artifact_expires_at"))
    policy_expired = created_at <= datetime.now(UTC) - timedelta(hours=retention_hours)
    signed_url_expired = artifact_expires_at is not None and artifact_expires_at <= datetime.now(UTC)
    return policy_expired and (signed_url_expired or not render.get("artifact_available"))


def _get_session_render(backend_job_id: str) -> dict[str, Any] | None:
    with session_scope() as session:
        if session is None:
            return None
        row = (
            session.query(SessionRenderRow)
            .filter(SessionRenderRow.backendJobId == backend_job_id)
            .one_or_none()
        )
        if row is None:
            return None
        return {
            "id": row.id,
            "target": row.target,
            "pinned": row.pinned,
            "artifact_available": row.artifactAvailable,
            "artifact_expires_at": row.artifactExpiresAt,
            "created_at": row.createdAt,
        }


def _mark_render_artifact_deleted(backend_job_id: str) -> None:
    with session_scope() as session:
        if session is None:
            return
        row = (
            session.query(SessionRenderRow)
            .filter(SessionRenderRow.backendJobId == backend_job_id)
            .one_or_none()
        )
        if row is None:
            return
        row.artifactAvailable = False
        row.videoUrl = None
        row.thumbnailUrl = None
        row.artifactExpiresAt = datetime.now(UTC)


def _parse_datetime(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError:
            return None
    else:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def main() -> None:
    parser = argparse.ArgumentParser(description="Clean expired Manim_AI jobs and artifacts.")
    parser.add_argument("--loop", action="store_true", help="Run forever at CLEANUP_INTERVAL_SEC.")
    args = parser.parse_args()
    settings = get_settings()

    while True:
        result = run_cleanup_once()
        logger.info("Cleanup finished: %s", result)
        if not args.loop:
            return
        time.sleep(settings.cleanup_interval_sec)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
