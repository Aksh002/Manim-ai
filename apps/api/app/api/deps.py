from functools import lru_cache

from fastapi import Header, HTTPException, Request
from redis import Redis

from app.core.config import get_settings
from app.schemas.auth import AuthenticatedUser
from app.services.cache_service import CacheService
from app.services.job_service import JobService
from app.services.llm_service import LLMService
from app.services.queue_service import QueueService
from app.services.storage_service import StorageService


@lru_cache
def get_redis() -> Redis:
    settings = get_settings()
    return Redis.from_url(settings.redis_url, decode_responses=True)


@lru_cache
def get_queue():
    from rq import Queue

    return Queue("render", connection=get_redis())


@lru_cache
def get_job_service() -> JobService:
    return JobService()


@lru_cache
def get_storage_service() -> StorageService:
    return StorageService()


@lru_cache
def get_queue_service() -> QueueService:
    return QueueService()


@lru_cache
def get_llm_service() -> LLMService:
    return LLMService()


@lru_cache
def get_cache_service() -> CacheService:
    return CacheService()


def get_authenticated_user(
    x_manim_internal_token: str | None = Header(default=None),
    x_manim_user_id: str | None = Header(default=None),
    x_manim_user_email: str | None = Header(default=None),
) -> AuthenticatedUser:
    settings = get_settings()
    if settings.internal_api_token:
        if x_manim_internal_token == settings.internal_api_token and x_manim_user_id:
            return AuthenticatedUser(
                user_id=x_manim_user_id,
                email=x_manim_user_email,
                is_internal=True,
                allow_owner_token_fallback=settings.allow_owner_token_fallback,
            )
        if not settings.allow_owner_token_fallback:
            raise HTTPException(status_code=401, detail="Internal API token is required")

    if not settings.internal_api_token and x_manim_user_id and settings.allow_owner_token_fallback:
        return AuthenticatedUser(
            user_id=x_manim_user_id,
            email=x_manim_user_email,
            is_internal=True,
            allow_owner_token_fallback=True,
        )

    if not settings.internal_api_token and not settings.allow_owner_token_fallback:
        raise HTTPException(status_code=401, detail="Internal API token is not configured")

    return AuthenticatedUser(
        user_id=None,
        email=None,
        is_internal=False,
        allow_owner_token_fallback=settings.allow_owner_token_fallback,
    )


def get_request_llm_service(request: Request) -> LLMService:
    provider_config = None
    base_url = request.headers.get("x-manim-llm-base-url")
    api_key = request.headers.get("x-manim-llm-api-key")
    model = request.headers.get("x-manim-llm-model")
    if base_url and api_key and model:
        provider_config = {
            "base_url": base_url,
            "api_key": api_key,
            "model": model,
        }
    return LLMService(provider_config=provider_config)


def authorize_job_access(
    job: dict,
    user: AuthenticatedUser,
    provided_owner_token: str | None,
) -> None:
    expected_user_id = job.get("user_id")
    if expected_user_id:
        if user.user_id == expected_user_id:
            return
        raise HTTPException(status_code=403, detail="Job does not belong to this user")

    expected_owner = job.get("owner_token")
    if expected_owner and user.allow_owner_token_fallback and provided_owner_token == expected_owner:
        return

    if expected_owner and not user.is_internal:
        raise HTTPException(status_code=403, detail="Job token is invalid")
    if user.is_internal:
        return
    raise HTTPException(status_code=403, detail="Job access is not authorized")
