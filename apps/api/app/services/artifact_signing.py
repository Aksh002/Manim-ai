from __future__ import annotations

import hmac
from datetime import UTC, datetime, timedelta
from hashlib import sha256

from app.core.config import get_settings


VALID_ARTIFACT_KINDS = {"video", "thumbnail"}


def _secret() -> str:
    settings = get_settings()
    return settings.artifact_signing_secret or "manim-ai-dev-artifact-signing-secret"


def artifact_expiry(ttl_seconds: int | None = None) -> datetime:
    settings = get_settings()
    ttl = ttl_seconds if ttl_seconds is not None else settings.artifact_url_ttl_sec
    return datetime.now(UTC) + timedelta(seconds=ttl)


def sign_artifact(job_id: str, kind: str, expires: int) -> str:
    if kind not in VALID_ARTIFACT_KINDS:
        raise ValueError(f"Unsupported artifact kind: {kind}")
    message = f"{job_id}:{kind}:{expires}".encode("utf-8")
    return hmac.new(_secret().encode("utf-8"), message, sha256).hexdigest()


def build_artifact_url(job_id: str, kind: str, *, ttl_seconds: int | None = None) -> tuple[str, datetime]:
    expires_at = artifact_expiry(ttl_seconds)
    expires = int(expires_at.timestamp())
    signature = sign_artifact(job_id, kind, expires)
    return f"/artifacts/{job_id}/{kind}?expires={expires}&sig={signature}", expires_at


def verify_artifact_signature(job_id: str, kind: str, expires: int, signature: str) -> bool:
    if kind not in VALID_ARTIFACT_KINDS:
        return False
    if datetime.now(UTC).timestamp() > expires:
        return False
    expected = sign_artifact(job_id, kind, expires)
    return hmac.compare_digest(expected, signature)
