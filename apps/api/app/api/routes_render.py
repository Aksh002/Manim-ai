from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status

from app.api.deps import get_authenticated_user, get_cache_service, get_job_service, get_queue, get_storage_service
from app.core.config import get_settings
from app.domain.enums import JobStatus
from app.schemas.auth import AuthenticatedUser
from app.schemas.render import RenderRequest, RenderResponse, RenderTarget
from app.services.cache_service import CacheService
from app.services.code_validator import CodeValidator
from app.services.job_service import JobService
from app.services.storage_service import StorageService
from app.workers.tasks_render import process_render_job

router = APIRouter(tags=["render"])
validator = CodeValidator()


@router.post("/render", response_model=RenderResponse, status_code=status.HTTP_202_ACCEPTED)
def render(
    payload: RenderRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    job_service: JobService = Depends(get_job_service),
    storage_service: StorageService = Depends(get_storage_service),
    cache_service: CacheService = Depends(get_cache_service),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    validation = validator.validate(payload.code)
    if not validation.ok and not payload.retry_on_error:
        raise HTTPException(status_code=400, detail={"errors": validation.errors})

    settings = get_settings()
    is_draft = payload.preview_first or payload.target == RenderTarget.DRAFT
    effective_quality = settings.preview_render_quality if is_draft else payload.quality.value
    render_identity = (
        f"render:v4:"
        f"{effective_quality}:"
        f"{settings.validator_policy_version}:"
        f"{settings.renderer_policy_version}:"
        f"{settings.renderer_image}:"
        f"{settings.renderer_image_digest}:"
        f"{settings.manim_version}:"
        f"{request.headers.get('x-manim-llm-base-url', settings.llm_base_url)}:"
        f"{request.headers.get('x-manim-llm-model', settings.llm_model)}:"
        f"{payload.code}"
    )
    render_hash = cache_service.hash_text(render_identity)
    owner_token = request.headers.get("x-manim-owner-token")
    cached_job_id = cache_service.get_render_artifact(render_hash)
    if cached_job_id:
        cached_video = storage_service.get(cached_job_id)
        if cached_video:
            record = job_service.create_job(
                owner_token=owner_token,
                user_id=user.user_id,
                input_code=payload.code,
                render_hash=render_hash,
            )
            cloned = storage_service.clone(cached_job_id, record["job_id"])
            if cloned:
                job_service.update_job(
                    record["job_id"],
                    status=JobStatus.DONE.value,
                    stage="done",
                    progress=100,
                    video_path=cloned,
                    final_code=payload.code,
                    thumbnail_url=f"/thumbnail/{record['job_id']}"
                    if storage_service.get_thumbnail(record["job_id"])
                    else None,
                )
                return RenderResponse(
                    job_id=record["job_id"],
                    status=JobStatus.DONE.value,
                    owner_token=record["owner_token"],
                )

    inflight_job_id = cache_service.get_render_inflight(render_hash)
    if inflight_job_id:
        inflight_job = job_service.get_job(inflight_job_id)
        if (
            inflight_job
            and (
                (user.user_id and inflight_job.get("user_id") == user.user_id)
                or inflight_job.get("owner_token") == owner_token
            )
            and inflight_job.get("status") not in {
            JobStatus.DONE.value,
            JobStatus.FAILED.value,
            JobStatus.TIMEOUT.value,
            JobStatus.CANCELLED.value,
            }
        ):
            return RenderResponse(
                job_id=inflight_job_id,
                status=inflight_job["status"],
                owner_token=inflight_job.get("owner_token"),
            )

    record = job_service.create_job(
        owner_token=owner_token,
        user_id=user.user_id,
        input_code=payload.code,
        render_hash=render_hash,
    )
    lock_acquired = cache_service.set_render_inflight(
        render_hash,
        record["job_id"],
        ttl_seconds=settings.render_timeout_sec + 120,
    )
    if not lock_acquired:
        inflight_job_id = cache_service.get_render_inflight(render_hash)
        inflight_job = job_service.get_job(inflight_job_id) if inflight_job_id else None
        if inflight_job and (
            (user.user_id and inflight_job.get("user_id") == user.user_id)
            or inflight_job.get("owner_token") == owner_token
        ):
            return RenderResponse(
                job_id=inflight_job_id,
                status=inflight_job["status"],
                owner_token=inflight_job.get("owner_token"),
            )

    if settings.use_queue:
        llm_config = _llm_config_from_headers(request)
        queue = get_queue()
        job_args = [
            record["job_id"],
            payload.code,
            effective_quality,
            payload.retry_on_error,
            render_hash,
        ]
        if llm_config:
            job_args.append(llm_config)
        queue.enqueue(
            "app.workers.tasks_render.process_render_job",
            *job_args,
            job_id=record["job_id"],
            job_timeout=settings.render_timeout_sec + 20,
        )
    else:
        llm_config = _llm_config_from_headers(request)
        if llm_config:
            background_tasks.add_task(
                process_render_job,
                record["job_id"],
                payload.code,
                effective_quality,
                payload.retry_on_error,
                render_hash,
                llm_config,
            )
        else:
            background_tasks.add_task(
                process_render_job,
                record["job_id"],
                payload.code,
                effective_quality,
                payload.retry_on_error,
                render_hash,
            )

    return RenderResponse(
        job_id=record["job_id"],
        status=record["status"],
        owner_token=record["owner_token"],
    )


def _llm_config_from_headers(request: Request) -> dict[str, str] | None:
    base_url = request.headers.get("x-manim-llm-base-url")
    api_key = request.headers.get("x-manim-llm-api-key")
    model = request.headers.get("x-manim-llm-model")
    if base_url and api_key and model:
        return {"base_url": base_url, "api_key": api_key, "model": model}
    return None
