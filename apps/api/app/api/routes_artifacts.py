from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import FileResponse, RedirectResponse

from app.api.deps import authorize_job_access, get_authenticated_user, get_job_service, get_storage_service
from app.domain.enums import JobStatus
from app.schemas.auth import AuthenticatedUser
from app.services.artifact_signing import verify_artifact_signature
from app.services.job_service import JobService
from app.services.storage_service import StorageService

router = APIRouter(tags=["artifacts"])


def _authorize_artifact(
    *,
    job_id: str,
    kind: Literal["video", "thumbnail"],
    expires: int | None,
    sig: str | None,
    owner_token: str | None,
    header_owner_token: str | None,
    job_service: JobService,
    user: AuthenticatedUser,
) -> dict:
    job = job_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] != JobStatus.DONE.value:
        raise HTTPException(status_code=409, detail=f"{kind.title()} is not ready yet")

    if expires is not None and sig:
        if not verify_artifact_signature(job_id, kind, expires, sig):
            raise HTTPException(status_code=403, detail="Artifact URL is invalid or expired")
        if job.get("user_id") and user.user_id != job.get("user_id"):
            raise HTTPException(status_code=403, detail="Artifact does not belong to this user")
        return job

    provided_owner = owner_token or header_owner_token
    authorize_job_access(job, user, provided_owner)
    return job


@router.get("/artifacts/{job_id}/{kind}")
def artifact(
    job_id: str,
    kind: Literal["video", "thumbnail"],
    expires: int | None = Query(default=None),
    sig: str | None = Query(default=None),
    owner_token: str | None = Query(default=None),
    x_manim_owner_token: str | None = Header(default=None),
    storage_service: StorageService = Depends(get_storage_service),
    job_service: JobService = Depends(get_job_service),
    user: AuthenticatedUser = Depends(get_authenticated_user),
):
    _authorize_artifact(
        job_id=job_id,
        kind=kind,
        expires=expires,
        sig=sig,
        owner_token=owner_token,
        header_owner_token=x_manim_owner_token,
        job_service=job_service,
        user=user,
    )

    if not storage_service.exists(job_id, kind):
        raise HTTPException(status_code=404, detail=f"{kind.title()} not found")

    s3_url = storage_service.signed_url(job_id, kind, expires_in=300)
    if s3_url:
        return RedirectResponse(s3_url)

    if kind == "video":
        path = storage_service.get(job_id)
        return FileResponse(path=path, media_type="video/mp4", filename=f"{job_id}.mp4")

    path = storage_service.get_thumbnail(job_id)
    return FileResponse(path=path, media_type="image/jpeg", filename=f"{job_id}.jpg")
