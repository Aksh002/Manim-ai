from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status

from app.api.deps import get_cache_service, get_job_service, get_queue, get_storage_service
from app.core.config import get_settings
from app.domain.enums import JobStatus
from app.schemas.render import RenderRequest, RenderResponse
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
):
    validation = validator.validate(payload.code)
    if not validation.ok and not payload.retry_on_error:
        raise HTTPException(status_code=400, detail={"errors": validation.errors})

    render_hash = cache_service.hash_text(f"render:v3:{payload.quality.value}:{payload.code}")
    owner_token = request.headers.get("x-manim-owner-token")
    cached_job_id = cache_service.get_render_artifact(render_hash)
    if cached_job_id:
        cached_video = storage_service.get(cached_job_id)
        if cached_video:
            record = job_service.create_job(
                owner_token=owner_token,
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
            and inflight_job.get("owner_token") == owner_token
            and inflight_job.get("status") not in {
            JobStatus.DONE.value,
            JobStatus.FAILED.value,
            JobStatus.TIMEOUT.value,
            }
        ):
            return RenderResponse(
                job_id=inflight_job_id,
                status=inflight_job["status"],
                owner_token=inflight_job.get("owner_token"),
            )

    record = job_service.create_job(
        owner_token=owner_token,
        input_code=payload.code,
        render_hash=render_hash,
    )
    settings = get_settings()
    lock_acquired = cache_service.set_render_inflight(
        render_hash,
        record["job_id"],
        ttl_seconds=settings.render_timeout_sec + 120,
    )
    if not lock_acquired:
        inflight_job_id = cache_service.get_render_inflight(render_hash)
        inflight_job = job_service.get_job(inflight_job_id) if inflight_job_id else None
        if inflight_job and inflight_job.get("owner_token") == owner_token:
            return RenderResponse(
                job_id=inflight_job_id,
                status=inflight_job["status"],
                owner_token=inflight_job.get("owner_token"),
            )

    if settings.use_queue:
        queue = get_queue()
        queue.enqueue(
            "app.workers.tasks_render.process_render_job",
            record["job_id"],
            payload.code,
            payload.quality.value,
            payload.retry_on_error,
            render_hash,
            job_timeout=settings.render_timeout_sec + 20,
        )
    else:
        background_tasks.add_task(
            process_render_job,
            record["job_id"],
            payload.code,
            payload.quality.value,
            payload.retry_on_error,
            render_hash,
        )

    return RenderResponse(
        job_id=record["job_id"],
        status=record["status"],
        owner_token=record["owner_token"],
    )
