from __future__ import annotations

import glob
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from app.core.config import get_settings
from app.sandbox.docker_runner import DockerRunner
from app.services.renderer_service_client import RendererServiceClient
from app.services.render_types import RenderResult, RenderTimeoutError


class RenderOrchestrator:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.docker_runner = DockerRunner()
        self.renderer_service = RendererServiceClient()

    def run(self, job_id: str, code: str, quality: str) -> RenderResult:
        if self.settings.render_mode == "service":
            return self.renderer_service.run(job_id=job_id, code=code, quality=quality)
        if self.settings.render_mode == "docker":
            return self.docker_runner.run(job_id=job_id, code=code, quality=quality)
        return self._run_local(job_id=job_id, code=code, quality=quality)

    def health(self) -> dict:
        if self.settings.render_mode == "service":
            return self.renderer_service.health()
        if self.settings.render_mode == "docker":
            image_check = subprocess.run(
                ["docker", "image", "inspect", self.settings.renderer_image],
                capture_output=True,
                text=True,
                timeout=10,
            )
            return {
                "mode": "docker",
                "ok": image_check.returncode == 0,
                "renderer_image": self.settings.renderer_image,
                "error": image_check.stderr.strip() if image_check.returncode else None,
            }

        manim = shutil.which("manim")
        ffmpeg = shutil.which("ffmpeg")
        return {
            "mode": "local",
            "ok": bool(manim and ffmpeg),
            "manim": manim,
            "ffmpeg": ffmpeg,
        }

    def cancel(self, job_id: str) -> bool:
        if self.settings.render_mode == "service":
            return self.renderer_service.cancel(job_id)
        return False

    def _run_local(self, job_id: str, code: str, quality: str) -> RenderResult:
        quality_map = {"1080p30": "-qh", "720p30": "-qm", "480p15": "-ql"}
        quality_flag = quality_map.get(quality, "-qh")

        with tempfile.TemporaryDirectory(prefix=f"manim_{job_id}_") as tmp_dir:
            script_path = Path(tmp_dir) / "scene.py"
            media_dir = Path(tmp_dir) / "media"
            script_path.write_text(code, encoding="utf-8")

            cmd = [
                "manim",
                quality_flag,
                str(script_path),
                "GeneratedScene",
                "--media_dir",
                str(media_dir),
                "-o",
                "render.mp4",
            ]

            try:
                subprocess.run(
                    cmd,
                    check=True,
                    timeout=self.settings.render_timeout_sec,
                    capture_output=True,
                    text=True,
                )
            except subprocess.TimeoutExpired as exc:
                raise RenderTimeoutError("Render timed out") from exc
            except subprocess.CalledProcessError as exc:
                stderr = (exc.stderr or "").strip()
                stdout = (exc.stdout or "").strip()
                raise RuntimeError(stderr or stdout or "Manim render failed") from exc

            candidates = glob.glob(os.path.join(tmp_dir, "**", "render.mp4"), recursive=True)
            if not candidates:
                raise RuntimeError("Render finished but output video not found")

            fd, stable_output = tempfile.mkstemp(prefix=f"{job_id}_", suffix=".mp4")
            os.close(fd)
            shutil.copyfile(candidates[0], stable_output)
            return RenderResult(video_file=stable_output)
