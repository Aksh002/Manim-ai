from fastapi import APIRouter, Depends, Header, HTTPException, Query

from app.api.deps import authorize_job_access, get_authenticated_user, get_job_service, get_queue_service
from app.domain.enums import JobStatus
from app.schemas.auth import AuthenticatedUser
from app.schemas.job import JobStatusResponse
from app.services.job_service import JobService, TERMINAL_STATUSES
from app.services.queue_service import QueueService

router = APIRouter(tags=["jobs"])


@router.post("/jobs/{job_id}/cancel", response_model=JobStatusResponse)
def cancel_job(
    job_id: str,
    owner_token: str | None = Query(default=None),
    x_manim_owner_token: str | None = Header(default=None),
    job_service: JobService = Depends(get_job_service),
    queue_service: QueueService = Depends(get_queue_service),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    job = job_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    provided_owner = owner_token or x_manim_owner_token
    authorize_job_access(job, user, provided_owner)

    original_status = job.get("status")
    if original_status in TERMINAL_STATUSES:
        return JobStatusResponse(**job, cancellable=False)

    requested = job_service.request_cancel(job_id)
    if not requested:
        raise HTTPException(status_code=404, detail="Job not found")

    if original_status == JobStatus.QUEUED.value and queue_service.cancel_queued_job(job_id):
        cancelled = job_service.cancel_job(job_id)
        return JobStatusResponse(**cancelled, cancellable=False)

    return JobStatusResponse(**requested, cancellable=True)
