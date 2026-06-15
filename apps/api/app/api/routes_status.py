from fastapi import APIRouter, Depends, Header, HTTPException, Query

from app.api.deps import get_job_service
from app.schemas.job import JobStatusResponse
from app.services.job_service import JobService

router = APIRouter(tags=["status"])


@router.get("/status/{job_id}", response_model=JobStatusResponse)
def status(
    job_id: str,
    owner_token: str | None = Query(default=None),
    x_manim_owner_token: str | None = Header(default=None),
    job_service: JobService = Depends(get_job_service),
):
    item = job_service.get_job(job_id)
    if not item:
        raise HTTPException(status_code=404, detail="Job not found")
    expected_owner = item.get("owner_token")
    provided_owner = owner_token or x_manim_owner_token
    if expected_owner and provided_owner != expected_owner:
        raise HTTPException(status_code=403, detail="Job token is invalid")
    return JobStatusResponse(**item)
