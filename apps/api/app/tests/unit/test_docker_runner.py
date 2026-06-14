from pathlib import Path

from app.sandbox import docker_runner

STREAM_OUTPUT_COMMAND = (
    'output_path="$(find /output /tmp/manim -name output.mp4 -type f | head -n 1)"; '
    'test -n "$output_path"; cat "$output_path"'
)


def test_docker_runner_uses_hardened_copy_exec_flow(monkeypatch, tmp_path) -> None:
    commands = []

    settings = type(
        "Settings",
        (),
        {
            "renderer_image": "manim-ai-renderer:test",
            "sandbox_cpu": "1.0",
            "sandbox_memory": "1g",
            "sandbox_pids_limit": 128,
            "sandbox_network_disabled": True,
            "sandbox_read_only": True,
            "sandbox_no_new_privileges": True,
            "sandbox_seccomp_profile": "",
            "render_timeout_sec": 30,
        },
    )()

    def fake_run(cmd, **kwargs):
        commands.append(cmd)
        if cmd[:2] == ["docker", "exec"] and cmd[-3:] == ["sh", "-c", STREAM_OUTPUT_COMMAND]:
            kwargs["stdout"].write(b"mp4")
        return type("Completed", (), {"stdout": "", "stderr": ""})()

    monkeypatch.setattr(docker_runner, "get_settings", lambda: settings)
    monkeypatch.setattr(docker_runner.subprocess, "run", fake_run)

    result = docker_runner.DockerRunner().run("job_test", "from manim import *", "480p15")

    create_cmd = next(cmd for cmd in commands if cmd[:2] == ["docker", "create"])
    assert "--network" in create_cmd and "none" in create_cmd
    assert "--read-only" in create_cmd
    assert "--cap-drop" in create_cmd and "ALL" in create_cmd
    assert "--security-opt" in create_cmd and "no-new-privileges:true" in create_cmd
    assert "-v" not in create_cmd
    assert "/workspace:size=16m,mode=755" in create_cmd
    assert "/output:size=512m,uid=1000,gid=1000,mode=755" in create_cmd
    assert "/home/runner/.cache:size=128m,uid=1000,gid=1000,mode=755" in create_cmd
    assert create_cmd[-2:] == ["manim-ai-renderer:test", "600"]

    write_cmd = next(cmd for cmd in commands if cmd[:5] == ["docker", "exec", "--user", "root", "-i"])
    assert write_cmd[-3:] == ["sh", "-c", "cat > /workspace/scene.py && chmod 0444 /workspace/scene.py"]
    assert "-v" not in write_cmd

    render_cmd = next(cmd for cmd in commands if cmd[:2] == ["docker", "exec"] and "/entrypoint.sh" in cmd)
    assert render_cmd[-4:] == ["/entrypoint.sh", "scene.py", "GeneratedScene", "480p15"]

    copy_out_cmd = next(
        cmd for cmd in commands if cmd[:2] == ["docker", "exec"] and cmd[-3:] == ["sh", "-c", STREAM_OUTPUT_COMMAND]
    )
    assert copy_out_cmd[-3:] == ["sh", "-c", STREAM_OUTPUT_COMMAND]

    cleanup_cmd = commands[-1]
    assert cleanup_cmd[:3] == ["docker", "rm", "-f"]
    Path(result.video_file).unlink(missing_ok=True)
