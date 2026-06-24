from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Literal

from app.core.config import get_settings


class StorageService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.backend = self.settings.storage_backend.lower()
        self.root = Path(self.settings.video_storage_root)
        if self.backend == "local":
            self.root.mkdir(parents=True, exist_ok=True)
        self._s3_client = None

    def _s3(self):
        if self._s3_client is not None:
            return self._s3_client
        try:
            import boto3
            from botocore.config import Config
        except ImportError as exc:
            raise RuntimeError("boto3 is required when STORAGE_BACKEND=s3") from exc

        if not self.settings.s3_bucket:
            raise RuntimeError("S3_BUCKET is required when STORAGE_BACKEND=s3")
        self._s3_client = boto3.client(
            "s3",
            endpoint_url=self.settings.s3_endpoint_url or None,
            region_name=self.settings.s3_region,
            aws_access_key_id=self.settings.s3_access_key_id or None,
            aws_secret_access_key=self.settings.s3_secret_access_key or None,
            config=Config(
                s3={"addressing_style": "path" if self.settings.s3_force_path_style else "auto"}
            ),
        )
        return self._s3_client

    def _key(self, job_id: str, kind: Literal["video", "thumbnail"]) -> str:
        suffix = "mp4" if kind == "video" else "jpg"
        return f"artifacts/{job_id}.{suffix}"

    def _local_path(self, job_id: str, kind: Literal["video", "thumbnail"]) -> Path:
        suffix = ".mp4" if kind == "video" else ".jpg"
        return self.root / f"{job_id}{suffix}"

    def put(self, job_id: str, src_file: str) -> str:
        if self.backend == "s3":
            key = self._key(job_id, "video")
            self._s3().upload_file(src_file, self.settings.s3_bucket, key)
            return key

        target = self._local_path(job_id, "video")
        shutil.copyfile(src_file, target)
        return str(target)

    def clone(self, source_job_id: str, target_job_id: str) -> str | None:
        if self.backend == "s3":
            source_key = self._key(source_job_id, "video")
            target_key = self._key(target_job_id, "video")
            if not self.exists(source_job_id, "video"):
                return None
            self._s3().copy_object(
                Bucket=self.settings.s3_bucket,
                CopySource={"Bucket": self.settings.s3_bucket, "Key": source_key},
                Key=target_key,
            )
            if self.exists(source_job_id, "thumbnail"):
                self._s3().copy_object(
                    Bucket=self.settings.s3_bucket,
                    CopySource={
                        "Bucket": self.settings.s3_bucket,
                        "Key": self._key(source_job_id, "thumbnail"),
                    },
                    Key=self._key(target_job_id, "thumbnail"),
                )
            return target_key

        src = self._local_path(source_job_id, "video")
        if not src.exists():
            return None
        dest = self._local_path(target_job_id, "video")
        shutil.copyfile(src, dest)
        thumbnail = self._local_path(source_job_id, "thumbnail")
        if thumbnail.exists():
            shutil.copyfile(thumbnail, self._local_path(target_job_id, "thumbnail"))
        return str(dest)

    def get(self, job_id: str) -> str | None:
        if self.backend == "s3":
            return self._key(job_id, "video") if self.exists(job_id, "video") else None

        target = self._local_path(job_id, "video")
        return str(target) if target.exists() else None

    def put_thumbnail(self, job_id: str, src_video: str) -> str | None:
        if self.backend == "s3":
            temp = Path(tempfile.mkdtemp(prefix=f"{job_id}_thumbnail_")) / f"{job_id}.jpg"
            target = temp
        else:
            target = self._local_path(job_id, "thumbnail")
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
        if not target.exists():
            return None
        if self.backend == "s3":
            key = self._key(job_id, "thumbnail")
            self._s3().upload_file(str(target), self.settings.s3_bucket, key)
            target.unlink(missing_ok=True)
            target.parent.rmdir()
            return key
        return str(target)

    def get_thumbnail(self, job_id: str) -> str | None:
        if self.backend == "s3":
            return self._key(job_id, "thumbnail") if self.exists(job_id, "thumbnail") else None

        target = self._local_path(job_id, "thumbnail")
        return str(target) if target.exists() else None

    def exists(self, job_id: str, kind: Literal["video", "thumbnail"]) -> bool:
        if self.backend == "s3":
            try:
                self._s3().head_object(Bucket=self.settings.s3_bucket, Key=self._key(job_id, kind))
                return True
            except Exception:
                return False
        return self._local_path(job_id, kind).exists()

    def signed_url(self, job_id: str, kind: Literal["video", "thumbnail"], expires_in: int) -> str | None:
        if not self.exists(job_id, kind):
            return None
        if self.backend == "s3":
            return self._s3().generate_presigned_url(
                "get_object",
                Params={"Bucket": self.settings.s3_bucket, "Key": self._key(job_id, kind)},
                ExpiresIn=expires_in,
            )
        return None

    def delete(self, job_id: str) -> None:
        if self.backend == "s3":
            for kind in ("video", "thumbnail"):
                try:
                    self._s3().delete_object(Bucket=self.settings.s3_bucket, Key=self._key(job_id, kind))
                except Exception:
                    pass
            return

        for kind in ("video", "thumbnail"):
            target = self._local_path(job_id, kind)
            if target.exists():
                target.unlink()
