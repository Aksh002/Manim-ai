from enum import StrEnum

from pydantic import BaseModel, Field


class StylePreset(StrEnum):
    MINIMAL = "minimal"
    COLORFUL = "colorful"
    GEOMETRIC_HEAVY = "geometric-heavy"


class LevelPreset(StrEnum):
    SCHOOL = "school"
    UNDERGRADUATE = "undergraduate"
    ADVANCED = "advanced"


class GenerateRequest(BaseModel):
    topic: str = Field(min_length=3, max_length=300)
    duration_seconds: int = Field(ge=15, le=180)
    style: StylePreset
    level: LevelPreset
    additional_instructions: str = Field(default="", max_length=500)


class GenerateResponse(BaseModel):
    code: str
    model: str
    source: str = "llm"
    warnings: list[str] = Field(default_factory=list)
