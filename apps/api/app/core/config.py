from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Manim AI API"
    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = "qwen3-coder"
    llm_max_tokens: int = 2048
    llm_system_prompt: str = ""
    llm_request_timeout_sec: int = 120
    allow_llm_fallback: bool = False
    prompt_policy_version: str = "2026-06-tex-safe-v1"
    validator_policy_version: str = "2026-06-static-repair-v1"
    renderer_policy_version: str = "2026-06-docker-tmpfs-v1"

    redis_url: str = "redis://redis:6379/0"
    use_queue: bool = True

    video_storage_root: str = "/data/videos"
    render_timeout_sec: int = 120
    max_render_retries: int = 2
    render_mode: str = "docker"
    default_render_quality: str = "1080p30"
    preview_render_quality: str = "480p15"

    renderer_image: str = "manim-ai-renderer:latest"
    renderer_image_digest: str = ""
    manim_version: str = "0.18.1"
    sandbox_cpu: str = "1.0"
    sandbox_memory: str = "1g"
    sandbox_pids_limit: int = 256
    sandbox_read_only: bool = True
    sandbox_network_disabled: bool = True
    sandbox_no_new_privileges: bool = True
    sandbox_seccomp_profile: str = ""

    cors_origins: str = "http://localhost:3000"
    rate_limit_per_min: int = 60
    trust_proxy_headers: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
