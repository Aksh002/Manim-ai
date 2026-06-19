from fastapi import APIRouter, Depends, Header, HTTPException, Query

from app.api.deps import authorize_job_access, get_authenticated_user, get_job_service, get_queue_service, get_storage_service
from app.domain.enums import JobStatus
from app.schemas.auth import AuthenticatedUser
from app.schemas.job import JobStatusResponse
from app.services.artifact_signing import build_artifact_url
from app.services.job_service import JobService
from app.services.queue_service import QueueService
from app.services.storage_service import StorageService

router = APIRouter(tags=["status"])


@router.get("/status/{job_id}", response_model=JobStatusResponse)
def status(
    job_id: str,
    owner_token: str | None = Query(default=None),
    x_manim_owner_token: str | None = Header(default=None),
    job_service: JobService = Depends(get_job_service),
    queue_service: QueueService = Depends(get_queue_service),
    storage_service: StorageService = Depends(get_storage_service),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    item = job_service.get_job(job_id)
    if not item:
        raise HTTPException(status_code=404, detail="Job not found")
    provided_owner = owner_token or x_manim_owner_token
    authorize_job_access(item, user, provided_owner)

    response_item = dict(item)
    response_item["queue_position"] = (
        queue_service.position(job_id) if hasattr(queue_service, "position") else None
    )
    response_item["queued_count"] = (
        queue_service.queued_count() if hasattr(queue_service, "queued_count") else None
    )
    response_item["cancellable"] = item.get("status") in {
        JobStatus.QUEUED.value,
        JobStatus.VALIDATING.value,
        JobStatus.RENDERING.value,
        JobStatus.RETRYING.value,
        JobStatus.CANCEL_REQUESTED.value,
    }
    def exists(kind: str) -> bool:
        if hasattr(storage_service, "exists"):
            return storage_service.exists(job_id, kind)  # type: ignore[arg-type]
        if kind == "video" and hasattr(storage_service, "get"):
            return bool(storage_service.get(job_id))
        if kind == "thumbnail" and hasattr(storage_service, "get_thumbnail"):
            return bool(storage_service.get_thumbnail(job_id))
        return False

    if item.get("status") == JobStatus.DONE.value:
        if exists("video"):
            video_url, expires_at = build_artifact_url(job_id, "video")
            response_item["video_url"] = video_url
            response_item["artifact_expires_at"] = expires_at
        if exists("thumbnail"):
            thumbnail_url, expires_at = build_artifact_url(job_id, "thumbnail")
            response_item["thumbnail_url"] = thumbnail_url
            response_item["artifact_expires_at"] = expires_at
    return JobStatusResponse(**response_item)
