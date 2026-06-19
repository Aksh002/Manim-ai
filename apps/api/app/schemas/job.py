from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class JobAttempt(BaseModel):
    attempt_number: int
    phase: str
    error_type: Optional[str] = None
    error_summary: Optional[str] = None
    input_code: Optional[str] = None
    output_code: Optional[str] = None
    render_log_ref: Optional[str] = None
    deterministic_repairs: list[str] = Field(default_factory=list)


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    progress: int
    stage: str
    error: Optional[str]
    created_at: datetime
    updated_at: datetime
    input_code: Optional[str] = None
    final_code: Optional[str] = None
    repair_attempts: int = 0
    attempts: list[JobAttempt] = Field(default_factory=list)
    error_type: Optional[str] = None
    error_summary: Optional[str] = None
    code_hash: Optional[str] = None
    artifact_metadata: Optional[dict[str, Any]] = None
    thumbnail_url: Optional[str] = None
    video_url: Optional[str] = None
    artifact_expires_at: Optional[datetime] = None
    quality_report: Optional[dict[str, Any]] = None
    render_hash: Optional[str] = None
    queue_position: Optional[int] = None
    queued_count: Optional[int] = None
    worker_id: Optional[str] = None
    cancellable: bool = False
    cancel_requested_at: Optional[datetime] = None
    generation_pipeline: Optional[dict[str, Any]] = None


class ApiError(BaseModel):
    detail: str
