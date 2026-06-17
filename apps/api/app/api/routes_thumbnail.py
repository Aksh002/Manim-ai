from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import FileResponse

from app.api.deps import get_job_service, get_storage_service
from app.domain.enums import JobStatus
from app.services.job_service import JobService
from app.services.storage_service import StorageService

router = APIRouter(tags=["thumbnail"])


@router.get("/thumbnail/{job_id}")
def thumbnail(
    job_id: str,
    owner_token: str | None = Query(default=None),
    x_manim_owner_token: str | None = Header(default=None),
    storage_service: StorageService = Depends(get_storage_service),
    job_service: JobService = Depends(get_job_service),
):
    job = job_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    expected_owner = job.get("owner_token")
    provided_owner = owner_token or x_manim_owner_token
    if expected_owner and provided_owner != expected_owner:
        raise HTTPException(status_code=403, detail="Job token is invalid")
    if job["status"] != JobStatus.DONE.value:
        raise HTTPException(status_code=409, detail="Thumbnail is not ready yet")

    thumbnail_path = storage_service.get_thumbnail(job_id)
    if not thumbnail_path:
        raise HTTPException(status_code=404, detail="Thumbnail not found")

    return FileResponse(path=thumbnail_path, media_type="image/jpeg", filename=f"{job_id}.jpg")
