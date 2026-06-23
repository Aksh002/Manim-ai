from __future__ import annotations

import tempfile
import os
from pathlib import Path
from typing import Any

import httpx

from app.core.config import get_settings
from app.services.render_types import RenderResult, RenderTimeoutError


class RendererServiceClient:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.base_url = self.settings.renderer_service_url.rstrip("/")

    def run(self, job_id: str, code: str, quality: str) -> RenderResult:
        timeout = self.settings.render_timeout_sec + 30
        try:
            with httpx.Client(timeout=timeout) as client:
                response = client.post(
                    f"{self.base_url}/render",
                    json={
                        "render_id": job_id,
                        "code": code,
                        "quality": quality,
                        "timeout_sec": self.settings.render_timeout_sec,
                    },
                )
                response.raise_for_status()
        except httpx.TimeoutException as exc:
            raise RenderTimeoutError("Renderer service timed out") from exc
        except httpx.HTTPStatusError as exc:
            detail = exc.response.text.strip()
            raise RuntimeError(detail or "Renderer service failed") from exc
        except httpx.HTTPError as exc:
            raise RuntimeError(f"Renderer service is unavailable: {exc}") from exc

        fd, output_name = tempfile.mkstemp(prefix=f"{job_id}_service_", suffix=".mp4")
        os.close(fd)
        output = Path(output_name)
        output.write_bytes(response.content)
        return RenderResult(video_file=str(output))

    def cancel(self, job_id: str) -> bool:
        try:
            with httpx.Client(timeout=10) as client:
                response = client.post(f"{self.base_url}/render/{job_id}/cancel")
            return response.status_code < 500
        except httpx.HTTPError:
            return False

    def health(self) -> dict[str, Any]:
        try:
            with httpx.Client(timeout=10) as client:
                response = client.get(f"{self.base_url}/health")
                response.raise_for_status()
                data = response.json()
        except Exception as exc:
            return {"mode": "service", "ok": False, "error": str(exc)}
        return {"mode": "service", **data}
