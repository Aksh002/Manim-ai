from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from app.core.config import get_settings


class StorageService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.root = Path(self.settings.video_storage_root)
        self.root.mkdir(parents=True, exist_ok=True)

    def put(self, job_id: str, src_file: str) -> str:
        target = self.root / f"{job_id}.mp4"
        shutil.copyfile(src_file, target)
        return str(target)

    def clone(self, source_job_id: str, target_job_id: str) -> str | None:
        src = self.root / f"{source_job_id}.mp4"
        if not src.exists():
            return None
        dest = self.root / f"{target_job_id}.mp4"
        shutil.copyfile(src, dest)
        thumbnail = self.root / f"{source_job_id}.jpg"
        if thumbnail.exists():
            shutil.copyfile(thumbnail, self.root / f"{target_job_id}.jpg")
        return str(dest)

    def get(self, job_id: str) -> str | None:
        target = self.root / f"{job_id}.mp4"
        return str(target) if target.exists() else None

    def put_thumbnail(self, job_id: str, src_video: str) -> str | None:
        target = self.root / f"{job_id}.jpg"
        try:
            subprocess.run(
                [
                    "ffmpeg",
                    "-y",
                    "-i",
                    src_video,
                    "-frames:v",
                    "1",
                    "-q:v",
                    "3",
                    str(target),
                ],
                check=True,
                timeout=20,
                capture_output=True,
                text=True,
            )
        except Exception:
            return None
        return str(target) if target.exists() else None

    def get_thumbnail(self, job_id: str) -> str | None:
        target = self.root / f"{job_id}.jpg"
        return str(target) if target.exists() else None

    def delete(self, job_id: str) -> None:
        for suffix in (".mp4", ".jpg"):
            target = self.root / f"{job_id}{suffix}"
            if target.exists():
                target.unlink()
