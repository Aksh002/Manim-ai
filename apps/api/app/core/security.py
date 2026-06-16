import time
from collections import defaultdict, deque

from fastapi import Request
from redis import Redis
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import get_settings


class SimpleRateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.hits: dict[str, deque[float]] = defaultdict(deque)
        self.redis: Redis | None = None
        try:
            settings = get_settings()
            self.redis = Redis.from_url(settings.redis_url, decode_responses=True)
            self.redis.ping()
        except Exception:
            self.redis = None

    def _client_key(self, request: Request) -> str:
        settings = get_settings()
        if settings.trust_proxy_headers:
            forwarded_for = request.headers.get("x-forwarded-for")
            if forwarded_for:
                return forwarded_for.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    async def dispatch(self, request: Request, call_next):
        settings = get_settings()
        if request.url.path.startswith("/health"):
            return await call_next(request)

        key = self._client_key(request)
        if self.redis:
            redis_key = f"rate:{key}:{int(time.time() // 60)}"
            hits = self.redis.incr(redis_key)
            if hits == 1:
                self.redis.expire(redis_key, 70)
            if hits > settings.rate_limit_per_min:
                return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})
            return await call_next(request)

        now = time.time()
        q = self.hits[key]

        while q and now - q[0] > 60:
            q.popleft()

        if len(q) >= settings.rate_limit_per_min:
            return JSONResponse(status_code=429, content={"detail": "Rate limit exceeded"})

        q.append(now)
        return await call_next(request)
