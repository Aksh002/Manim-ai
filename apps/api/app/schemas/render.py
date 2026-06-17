from enum import StrEnum

from pydantic import BaseModel, Field


class RenderQuality(StrEnum):
    HIGH = "1080p30"
    MEDIUM = "720p30"
    LOW = "480p15"


class RenderRequest(BaseModel):
    code: str = Field(min_length=1, max_length=100_000)
    quality: RenderQuality = RenderQuality.HIGH
    retry_on_error: bool = True
    preview_first: bool = False


class RenderResponse(BaseModel):
    job_id: str
    status: str
    owner_token: str | None = None


class RegenerateRequest(BaseModel):
    code: str = Field(min_length=1, max_length=100_000)
    instruction: str = Field(min_length=1, max_length=500)


class RegenerateResponse(BaseModel):
    code: str
