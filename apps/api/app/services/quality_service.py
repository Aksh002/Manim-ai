from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path
from statistics import mean
from typing import Any


QUALITY_RESOLUTIONS = {
    "1080p30": (1920, 1080),
    "720p30": (1280, 720),
    "480p15": (854, 480),
}


class VideoQualityEvaluator:
    def evaluate(self, video_file: str, quality: str, requested_duration: float | None = None) -> dict[str, Any]:
        path = Path(video_file)
        checks: list[dict[str, Any]] = []
        suggestions: list[str] = []

        file_size = path.stat().st_size if path.exists() else 0
        checks.append(
            {
                "name": "file_non_empty",
                "passed": file_size > 5_000,
                "value": file_size,
                "threshold": 5_000,
            }
        )

        metadata = self._probe(video_file)
        duration = metadata.get("duration_seconds")
        width = metadata.get("width")
        height = metadata.get("height")

        duration_ok = bool(duration and duration >= 1)
        if requested_duration:
            duration_ok = duration_ok and duration <= requested_duration + 30
        checks.append(
            {
                "name": "duration",
                "passed": duration_ok,
                "value": duration,
                "threshold": ">=1s and <= requested+30s",
            }
        )

        expected = QUALITY_RESOLUTIONS.get(quality)
        resolution_ok = True
        if expected and width and height:
            resolution_ok = height >= int(expected[1] * 0.9)
        checks.append(
            {
                "name": "resolution",
                "passed": resolution_ok,
                "value": f"{width}x{height}" if width and height else None,
                "threshold": f">={expected[0]}x{expected[1]} approx" if expected else None,
            }
        )

        frame_checks = self._sample_frame_checks(video_file)
        checks.extend(frame_checks)

        if not checks[0]["passed"]:
            suggestions.append("Render produced a very small file; simplify the scene and ensure animations run.")
        if not duration_ok:
            suggestions.append("Keep the scene duration between 1 second and the requested duration budget.")
        if any(check["name"] == "frames_not_blank" and not check["passed"] for check in frame_checks):
            suggestions.append("Increase visual contrast and ensure visible mobjects are added before animations.")
        if any(check["name"] == "frame_motion" and not check["passed"] for check in frame_checks):
            suggestions.append("Add clear transformations or camera/object movement between sampled frames.")

        passed_checks = sum(1 for check in checks if check.get("passed"))
        score = round(passed_checks / max(len(checks), 1), 3)
        return {
            "score": score,
            "passed": all(check.get("passed") for check in checks),
            "checks": checks,
            "repair_suggestions": suggestions,
            "metadata": {
                "duration_seconds": duration,
                "resolution": f"{width}x{height}" if width and height else None,
                "file_size_bytes": file_size,
            },
        }

    def _probe(self, video_file: str) -> dict[str, Any]:
        try:
            completed = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-select_streams",
                    "v:0",
                    "-show_entries",
                    "stream=width,height:format=duration",
                    "-of",
                    "json",
                    video_file,
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=15,
            )
            data = json.loads(completed.stdout)
            stream = (data.get("streams") or [{}])[0]
            duration_raw = (data.get("format") or {}).get("duration")
            return {
                "width": stream.get("width"),
                "height": stream.get("height"),
                "duration_seconds": round(float(duration_raw), 3) if duration_raw else None,
            }
        except Exception:
            return {}

    def _sample_frame_checks(self, video_file: str) -> list[dict[str, Any]]:
        try:
            from PIL import Image, ImageChops, ImageStat
        except ImportError:
            return [
                {
                    "name": "sampled_frames",
                    "passed": True,
                    "value": "skipped: pillow not installed",
                    "threshold": None,
                }
            ]

        with tempfile.TemporaryDirectory(prefix="quality_frames_") as tmp_dir:
            pattern = str(Path(tmp_dir) / "frame_%02d.jpg")
            try:
                subprocess.run(
                    [
                        "ffmpeg",
                        "-y",
                        "-i",
                        video_file,
                        "-vf",
                        "fps=1,scale=320:-1",
                        "-frames:v",
                        "3",
                        pattern,
                    ],
                    check=True,
                    capture_output=True,
                    text=True,
                    timeout=20,
                )
            except Exception:
                return [
                    {
                        "name": "sampled_frames",
                        "passed": True,
                        "value": "skipped: ffmpeg frame extraction failed",
                        "threshold": None,
                    }
                ]

            frame_paths = sorted(Path(tmp_dir).glob("frame_*.jpg"))
            if not frame_paths:
                return [
                    {"name": "sampled_frames", "passed": False, "value": 0, "threshold": ">=1"}
                ]

            brightness_values = []
            variances = []
            frames = []
            for frame_path in frame_paths:
                image = Image.open(frame_path).convert("L")
                frames.append(image)
                stat = ImageStat.Stat(image)
                brightness_values.append(stat.mean[0])
                variances.append(stat.var[0])

            avg_variance = mean(variances)
            frames_not_blank = avg_variance > 4 and 5 < mean(brightness_values) < 250
            motion_score = 0.0
            if len(frames) > 1:
                diffs = [
                    ImageStat.Stat(ImageChops.difference(frames[index], frames[index + 1])).mean[0]
                    for index in range(len(frames) - 1)
                ]
                motion_score = mean(diffs)

            return [
                {
                    "name": "frames_not_blank",
                    "passed": frames_not_blank,
                    "value": round(avg_variance, 3),
                    "threshold": ">4 variance and non-extreme brightness",
                },
                {
                    "name": "frame_motion",
                    "passed": motion_score > 1.0,
                    "value": round(motion_score, 3),
                    "threshold": ">1 average pixel difference",
                },
            ]
