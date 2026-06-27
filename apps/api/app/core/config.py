from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Manim AI API"
    llm_base_url: str = ""
    llm_api_key: str = ""
    llm_model: str = "qwen3-coder"
    llm_max_tokens: int = 2048
    llm_storyboard_max_tokens: int = 1500
    llm_scene_plan_max_tokens: int = 3000
    llm_code_max_tokens: int = 6000
    llm_repair_max_tokens: int = 4000
    llm_system_prompt: str = ""
    llm_request_timeout_sec: int = 120
    allow_llm_fallback: bool = False
    database_url: str = ""
    internal_api_token: str = ""
    allow_owner_token_fallback: bool = True
    free_credits_on_signup: int = 5
    byok_daily_render_limit: int = 20
    user_secret_encryption_key: str = ""
    prompt_policy_version: str = "2026-06-skill-guided-v1"
    validator_policy_version: str = "2026-06-static-repair-v1"
    renderer_policy_version: str = "2026-06-docker-tmpfs-v1"
    skill_policy_version: str = "2026-06-skill-guided-v1"
    skill_context_max_chars: int = 6000
    planner_critic_enabled: bool = True
    planner_critic_threshold: float = 0.72

    redis_url: str = "redis://redis:6379/0"
    use_queue: bool = True

    video_storage_root: str = "/data/videos"
    storage_backend: str = "local"
    s3_endpoint_url: str = ""
    s3_bucket: str = ""
    s3_region: str = "auto"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_force_path_style: bool = True
    artifact_signing_secret: str = ""
    artifact_url_ttl_sec: int = 900
    job_retention_hours: int = 72
    artifact_retention_hours: int = 72
    cleanup_interval_sec: int = 3600

    render_timeout_sec: int = 120
    max_render_retries: int = 2
    render_mode: str = "docker"
    renderer_service_url: str = "http://renderer:8100"
    default_render_quality: str = "1080p30"
    preview_render_quality: str = "480p15"

    renderer_image: str = "manim-ai-renderer:latest"
    renderer_image_digest: str = ""
    manim_version: str = "0.20.1"
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

    generation_pipeline_mode: str = "structured"
    max_generation_repairs: int = 2


@lru_cache
def get_settings() -> Settings:
    return Settings()
