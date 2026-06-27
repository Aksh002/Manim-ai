from __future__ import annotations

import hashlib
from threading import Lock

from redis import Redis

from app.core.config import get_settings


class CacheService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self._redis: Redis | None = None
        self._mem: dict[str, str] = {}
        self._lock = Lock()
        try:
            self._redis = Redis.from_url(self.settings.redis_url, decode_responses=True)
            self._redis.ping()
        except Exception:
            self._redis = None

    def hash_text(self, text: str) -> str:
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    def _get(self, key: str) -> str | None:
        if self._redis:
            return self._redis.get(key)
        with self._lock:
            return self._mem.get(key)

    def _set(self, key: str, value: str, ex: int | None = None, nx: bool = False) -> bool:
        if self._redis:
            return bool(self._redis.set(key, value, ex=ex, nx=nx))
        with self._lock:
            if nx and key in self._mem:
                return False
            self._mem[key] = value
        return True

    def _delete(self, key: str) -> None:
        if self._redis:
            self._redis.delete(key)
            return
        with self._lock:
            self._mem.pop(key, None)

    def get_generation(self, request_hash: str) -> str | None:
        return self._get(f"cache:generate:{request_hash}")

    def set_generation(self, request_hash: str, code: str) -> None:
        self._set(f"cache:generate:{request_hash}", code)

    def get_generation_payload(self, request_hash: str) -> str | None:
        return self._get(f"cache:generate:payload:{request_hash}")

    def set_generation_payload(self, request_hash: str, payload_json: str) -> None:
        self._set(f"cache:generate:payload:{request_hash}", payload_json)

    def get_render_artifact(self, render_hash: str) -> str | None:
        return self._get(f"cache:render:artifact:{render_hash}")

    def set_render_artifact(self, render_hash: str, job_id: str) -> None:
        self._set(f"cache:render:artifact:{render_hash}", job_id)

    def get_render_inflight(self, render_hash: str) -> str | None:
        return self._get(f"cache:render:inflight:{render_hash}")

    def set_render_inflight(self, render_hash: str, job_id: str, ttl_seconds: int) -> bool:
        return self._set(f"cache:render:inflight:{render_hash}", job_id, ex=ttl_seconds, nx=True)

    def clear_render_inflight(self, render_hash: str) -> None:
        self._delete(f"cache:render:inflight:{render_hash}")
