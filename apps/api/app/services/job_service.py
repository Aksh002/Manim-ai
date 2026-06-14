from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from threading import Lock
from typing import Any

from redis import Redis

from app.core.config import get_settings
from app.domain.enums import JobStatus


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

    def create_job(
        self,
        *,
        owner_token: str | None = None,
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
            "input_code": input_code,
            "final_code": None,
            "repair_attempts": 0,
            "render_hash": render_hash,
        }

        if self._redis:
            self._redis.set(self._key(job_id), json.dumps(payload))
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
