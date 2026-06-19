from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta
from threading import Lock
from typing import Any

from redis import Redis

from app.core.config import get_settings
from app.domain.enums import JobStatus

TERMINAL_STATUSES = {
    JobStatus.DONE.value,
    JobStatus.FAILED.value,
    JobStatus.TIMEOUT.value,
    JobStatus.CANCELLED.value,
}


class JobService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._mem: dict[str, dict[str, Any]] = {}
        self._lock = Lock()
        self._redis: Redis | None = None
        try:
            self._redis = Redis.from_url(self.settings.redis_url, decode_responses=True)
            self._redis.ping()
        except Exception:
            self._redis = None

    def _now(self) -> str:
        return datetime.now(UTC).isoformat()

    def _key(self, job_id: str) -> str:
        return f"job:{job_id}"

    def _cancel_key(self, job_id: str) -> str:
        return f"job:cancel:{job_id}"

    def create_job(
        self,
        *,
        owner_token: str | None = None,
        user_id: str | None = None,
        input_code: str | None = None,
        render_hash: str | None = None,
    ) -> dict[str, Any]:
        job_id = f"job_{uuid.uuid4().hex[:12]}"
        now = self._now()
        payload = {
            "job_id": job_id,
            "status": JobStatus.QUEUED.value,
            "progress": 0,
            "stage": "queued",
            "error": None,
            "created_at": now,
            "updated_at": now,
            "video_path": None,
            "owner_token": owner_token or uuid.uuid4().hex,
            "user_id": user_id,
            "input_code": input_code,
            "final_code": None,
            "repair_attempts": 0,
            "attempts": [],
            "error_type": None,
            "error_summary": None,
            "code_hash": None,
            "artifact_metadata": None,
            "thumbnail_url": None,
            "video_url": None,
            "artifact_expires_at": None,
            "quality_report": None,
            "cancel_requested_at": None,
            "generation_pipeline": None,
            "render_hash": render_hash,
        }

        if self._redis:
            self._redis.set(self._key(job_id), json.dumps(payload))
            self._redis.zadd("jobs:index", {job_id: datetime.now(UTC).timestamp()})
            return payload

        with self._lock:
            self._mem[job_id] = payload
        return payload

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        if self._redis:
            value = self._redis.get(self._key(job_id))
            return json.loads(value) if value else None
        return self._mem.get(job_id)

    def update_job(self, job_id: str, **updates: Any) -> dict[str, Any] | None:
        item = self.get_job(job_id)
        if not item:
            return None

        item.update(updates)
        item["updated_at"] = self._now()

        if self._redis:
            self._redis.set(self._key(job_id), json.dumps(item))
        else:
            with self._lock:
                self._mem[job_id] = item

        return item

    def append_attempt(self, job_id: str, attempt: dict[str, Any]) -> dict[str, Any] | None:
        item = self.get_job(job_id)
        if not item:
            return None

        attempts = item.get("attempts")
        if not isinstance(attempts, list):
            attempts = []
        attempts.append(attempt)
        return self.update_job(job_id, attempts=attempts)

    def request_cancel(self, job_id: str) -> dict[str, Any] | None:
        now = self._now()
        if self._redis:
            self._redis.set(self._cancel_key(job_id), "1", ex=self.settings.render_timeout_sec + 600)
        job = self.get_job(job_id)
        if not job:
            return None
        if job.get("status") in TERMINAL_STATUSES:
            return job
        return self.update_job(
            job_id,
            status=JobStatus.CANCEL_REQUESTED.value,
            stage="cancel_requested",
            cancel_requested_at=now,
            error=None,
        )

    def cancel_job(self, job_id: str) -> dict[str, Any] | None:
        if self._redis:
            self._redis.delete(self._cancel_key(job_id))
        return self.update_job(
            job_id,
            status=JobStatus.CANCELLED.value,
            stage="cancelled",
            progress=100,
            error=None,
        )

    def is_cancel_requested(self, job_id: str) -> bool:
        if self._redis:
            if self._redis.get(self._cancel_key(job_id)) == "1":
                return True
        job = self.get_job(job_id)
        return bool(job and job.get("status") == JobStatus.CANCEL_REQUESTED.value)

    def expired_job_ids(self, older_than_hours: int) -> list[str]:
        cutoff = datetime.now(UTC) - timedelta(hours=older_than_hours)
        if self._redis:
            ids = self._redis.zrangebyscore("jobs:index", min="-inf", max=cutoff.timestamp())
            expired = []
            for job_id in ids:
                job = self.get_job(job_id)
                if job and job.get("status") in TERMINAL_STATUSES:
                    expired.append(job_id)
            return expired

        with self._lock:
            jobs = list(self._mem.values())
        expired = []
        for job in jobs:
            try:
                created_at = datetime.fromisoformat(job["created_at"])
            except Exception:
                continue
            if created_at < cutoff and job.get("status") in TERMINAL_STATUSES:
                expired.append(job["job_id"])
        return expired

    def delete_job(self, job_id: str) -> None:
        if self._redis:
            self._redis.delete(self._key(job_id))
            self._redis.delete(self._cancel_key(job_id))
            self._redis.zrem("jobs:index", job_id)
            return
        with self._lock:
            self._mem.pop(job_id, None)
