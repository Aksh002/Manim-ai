from __future__ import annotations

import argparse
import logging
import time

from app.core.config import get_settings
from app.services.job_service import JobService
from app.services.storage_service import StorageService

logger = logging.getLogger(__name__)


def run_cleanup_once() -> dict[str, int]:
    settings = get_settings()
    jobs = JobService()
    storage = StorageService()
    expired_job_ids = jobs.expired_job_ids(settings.job_retention_hours)
    deleted_jobs = 0
    deleted_artifacts = 0

    for job_id in expired_job_ids:
        try:
            storage.delete(job_id)
            deleted_artifacts += 1
        except Exception:
            logger.exception("Failed to delete artifacts for %s", job_id)
        jobs.delete_job(job_id)
        deleted_jobs += 1

    return {"deleted_jobs": deleted_jobs, "deleted_artifacts": deleted_artifacts}


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
