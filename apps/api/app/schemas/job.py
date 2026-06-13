from datetime import datetime
from typing import Optional

from pydantic import BaseModel


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
    render_hash: Optional[str] = None


class ApiError(BaseModel):
    detail: str
