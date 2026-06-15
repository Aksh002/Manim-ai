from functools import lru_cache

from redis import Redis

from app.core.config import get_settings
from app.services.cache_service import CacheService
from app.services.job_service import JobService
from app.services.llm_service import LLMService
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
def get_llm_service() -> LLMService:
    return LLMService()


@lru_cache
def get_cache_service() -> CacheService:
    return CacheService()
