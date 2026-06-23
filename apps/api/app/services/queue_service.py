from __future__ import annotations

from datetime import datetime
from typing import Any

from redis import Redis

from app.core.config import get_settings


class QueueService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._redis: Redis | None = None
        try:
            self._redis = Redis.from_url(self.settings.redis_url, decode_responses=True)
            self._redis.ping()
        except Exception:
            self._redis = None

    def _queue(self):
        if not self._redis:
            return None
        from rq import Queue

        return Queue("render", connection=self._redis)

    def queued_count(self) -> int | None:
        queue = self._queue()
        return len(queue) if queue else None

    def position(self, job_id: str) -> int | None:
        queue = self._queue()
        if not queue:
            return None
        try:
            job_ids = queue.job_ids
        except Exception:
            return None
        try:
            return job_ids.index(job_id) + 1
        except ValueError:
            return None

    def cancel_queued_job(self, job_id: str) -> bool:
        if not self._redis:
            return False
        try:
            from rq.job import Job as RQJob

            rq_job = RQJob.fetch(job_id, connection=self._redis)
            rq_job.cancel()
            rq_job.delete()
            return True
        except Exception:
            return False

    def worker_health(self) -> dict[str, Any]:
        if not self._redis:
            return {
                "queued_count": None,
                "workers": [],
                "active_workers": 0,
            }
        try:
            from rq import Worker

            workers = []
            for worker in Worker.all(connection=self._redis):
                current_job = worker.get_current_job()
                heartbeat = worker.last_heartbeat
                if isinstance(heartbeat, datetime):
                    heartbeat_value = heartbeat.isoformat()
                else:
                    heartbeat_value = str(heartbeat) if heartbeat else None
                workers.append(
                    {
                        "name": worker.name,
                        "state": worker.get_state(),
                        "last_heartbeat": heartbeat_value,
                        "current_job_id": current_job.id if current_job else None,
                    }
                )
            return {
                "queued_count": self.queued_count(),
                "workers": workers,
                "active_workers": len(workers),
            }
        except Exception as exc:
            return {
                "queued_count": self.queued_count(),
                "workers": [],
                "active_workers": 0,
                "error": str(exc),
            }
