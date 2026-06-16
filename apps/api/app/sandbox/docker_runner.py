from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

from app.core.config import get_settings
from app.services.render_types import RenderResult, RenderTimeoutError


class DockerRunner:
    def __init__(self) -> None:
        self.settings = get_settings()

    def _run_docker_command(
        self,
        cmd: list[str],
        timeout: int,
        input_text: str | None = None,
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            cmd,
            check=True,
            timeout=timeout,
            capture_output=True,
            text=True,
            input=input_text,
        )

    def _write_docker_output_to_file(self, cmd: list[str], output_file: Path, timeout: int) -> None:
        with output_file.open("wb") as stdout:
            subprocess.run(
                cmd,
                check=True,
                timeout=timeout,
                stdout=stdout,
                stderr=subprocess.PIPE,
            )

    def preflight(self) -> None:
        try:
            subprocess.run(
                ["docker", "version", "--format", "{{.Server.Version}}"],
                check=True,
                timeout=10,
                capture_output=True,
                text=True,
            )
            subprocess.run(
                ["docker", "image", "inspect", self.settings.renderer_image],
                check=True,
                timeout=10,
                capture_output=True,
                text=True,
            )
        except FileNotFoundError as exc:
            raise RuntimeError("Docker CLI is not available in the worker container") from exc
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("Docker preflight timed out") from exc
        except subprocess.CalledProcessError as exc:
            detail = (exc.stderr or exc.stdout or "").strip()
            raise RuntimeError(
                f"Renderer preflight failed for {self.settings.renderer_image}: {detail}"
            ) from exc

    def run(self, job_id: str, code: str, quality: str) -> RenderResult:
        self.preflight()
        with tempfile.TemporaryDirectory(prefix=f"sandbox_{job_id}_") as tmp_dir:
            output_file = Path(tmp_dir) / "output.mp4"
            container_name = f"manim-render-{job_id}-{uuid.uuid4().hex[:8]}"

            create_cmd = [
                "docker",
                "create",
                "--name",
                container_name,
                "--cpus",
                self.settings.sandbox_cpu,
                "--memory",
                self.settings.sandbox_memory,
                "--pids-limit",
                str(self.settings.sandbox_pids_limit),
                "--tmpfs",
                "/tmp:size=256m,mode=1777",
                "--tmpfs",
                "/workspace:size=16m,mode=755",
                "--tmpfs",
                "/output:size=512m,uid=1000,gid=1000,mode=755",
                "--tmpfs",
                "/home/runner/.cache:size=128m,uid=1000,gid=1000,mode=755",
                "--cap-drop",
                "ALL",
                "--entrypoint",
                "sleep",
            ]

            if self.settings.sandbox_network_disabled:
                create_cmd.extend(["--network", "none"])
            if self.settings.sandbox_read_only:
                create_cmd.append("--read-only")
            if self.settings.sandbox_no_new_privileges:
                create_cmd.extend(["--security-opt", "no-new-privileges:true"])
            if self.settings.sandbox_seccomp_profile and Path(self.settings.sandbox_seccomp_profile).exists():
                create_cmd.extend(["--security-opt", f"seccomp={self.settings.sandbox_seccomp_profile}"])

            create_cmd.extend([self.settings.renderer_image, "600"])

            try:
                self._run_docker_command(create_cmd, timeout=10)
                self._run_docker_command(["docker", "start", container_name], timeout=10)
                self._run_docker_command(
                    [
                        "docker",
                        "exec",
                        "--user",
                        "root",
                        "-i",
                        container_name,
                        "sh",
                        "-c",
                        "cat > /workspace/scene.py && chmod 0444 /workspace/scene.py",
                    ],
                    timeout=10,
                    input_text=code,
                )
                self._run_docker_command(
                    [
                        "docker",
                        "exec",
                        container_name,
                        "/entrypoint.sh",
                        "scene.py",
                        "GeneratedScene",
                        quality,
                    ],
                    timeout=self.settings.render_timeout_sec,
                )
                self._write_docker_output_to_file(
                    [
                        "docker",
                        "exec",
                        container_name,
                        "sh",
                        "-c",
                        'output_path="$(find /output /tmp/manim -name output.mp4 -type f | head -n 1)"; '
                        'test -n "$output_path"; cat "$output_path"',
                    ],
                    output_file=output_file,
                    timeout=30,
                )
            except subprocess.TimeoutExpired as exc:
                raise RenderTimeoutError("Sandbox render timed out") from exc
            except subprocess.CalledProcessError as exc:
                stderr_raw = exc.stderr or ""
                stdout_raw = exc.stdout or ""
                stderr = (
                    stderr_raw.decode(errors="replace").strip()
                    if isinstance(stderr_raw, bytes)
                    else stderr_raw.strip()
                )
                stdout = (
                    stdout_raw.decode(errors="replace").strip()
                    if isinstance(stdout_raw, bytes)
                    else stdout_raw.strip()
                )
                raise RuntimeError(stderr or stdout or "Sandbox render failed") from exc
            finally:
                subprocess.run(
                    ["docker", "rm", "-f", container_name],
                    timeout=10,
                    capture_output=True,
                    text=True,
                    check=False,
                )

            if not output_file.exists():
                raise RuntimeError("Sandbox render finished but output.mp4 is missing")

            fd, stable_output = tempfile.mkstemp(prefix=f"{job_id}_", suffix=".mp4")
            os.close(fd)
            shutil.copyfile(output_file, stable_output)
            return RenderResult(video_file=stable_output)
