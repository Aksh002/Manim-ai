from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ClassifiedError:
    error_type: str
    summary: str


def classify_error(message: str) -> ClassifiedError:
    normalized = message.lower()
    compact = " ".join(message.strip().split())
    summary = compact[:500] if compact else "Unknown error"

    if "validation failed" in normalized:
        return ClassifiedError("validation", summary)
    if "latex" in normalized or "tex" in normalized or "dvi" in normalized:
        return ClassifiedError("latex", summary)
    if "unknown scene method" in normalized or "attributeerror" in normalized:
        return ClassifiedError("manim_api", summary)
    if "timed out" in normalized or "timeout" in normalized:
        return ClassifiedError("timeout", summary)
    if "docker" in normalized or "renderer preflight" in normalized or "sandbox" in normalized:
        return ClassifiedError("sandbox", summary)
    if "not found" in normalized and ("latex" in normalized or "manim" in normalized):
        return ClassifiedError("missing_dependency", summary)
    return ClassifiedError("unknown", summary)
