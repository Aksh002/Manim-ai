from __future__ import annotations

import glob
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from threading import Lock

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

app = FastAPI(title="Manim AI Renderer")
active_processes: dict[str, subprocess.Popen] = {}
process_lock = Lock()


class RenderRequest(BaseModel):
    render_id: str = Field(min_length=1, max_length=120)
    code: str = Field(min_length=1, max_length=100_000)
    quality: str = "480p15"
    timeout_sec: int = Field(default=120, ge=5, le=600)


@app.get("/health")
def health():
    checks = {
        "manim": shutil.which("manim"),
        "ffmpeg": shutil.which("ffmpeg"),
        "latex": shutil.which("latex"),
        "dvisvgm": shutil.which("dvisvgm"),
        "tmp_writable": os.access(tempfile.gettempdir(), os.W_OK),
    }
    return {"ok": all(bool(value) for value in checks.values()), "checks": checks}


@app.post("/render")
def render(payload: RenderRequest):
    quality_map = {"1080p30": "-qh", "720p30": "-qm", "480p15": "-ql"}
    quality_flag = quality_map.get(payload.quality, "-ql")

    with tempfile.TemporaryDirectory(prefix=f"render_{payload.render_id}_") as tmp_dir:
        script_path = Path(tmp_dir) / "scene.py"
        media_dir = Path(tmp_dir) / "media"
        script_path.write_text(payload.code, encoding="utf-8")
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

        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        with process_lock:
            active_processes[payload.render_id] = process
        try:
            stdout, stderr = process.communicate(timeout=payload.timeout_sec)
        except subprocess.TimeoutExpired as exc:
            process.kill()
            process.communicate()
            raise HTTPException(status_code=504, detail="Render timed out") from exc
        finally:
            with process_lock:
                active_processes.pop(payload.render_id, None)

        if process.returncode != 0:
            raise HTTPException(status_code=422, detail=(stderr or stdout or "Manim render failed"))

        candidates = glob.glob(os.path.join(tmp_dir, "**", "render.mp4"), recursive=True)
        if not candidates:
            raise HTTPException(status_code=500, detail="Render finished but output video was not found")
        return Response(Path(candidates[0]).read_bytes(), media_type="video/mp4")


@app.post("/render/{render_id}/cancel")
def cancel(render_id: str):
    with process_lock:
        process = active_processes.get(render_id)
    if not process:
        return {"cancelled": False, "reason": "not_running"}
    process.terminate()
    return {"cancelled": True}
