import tempfile
from types import SimpleNamespace

from app.workers import tasks_render


def test_render_feedback_loop_repairs_validation_then_renders(monkeypatch) -> None:
    initial_code = "from manim import *\n\nclass Wrong(Scene):\n    def construct(self):\n        pass\n"
    fixed_code = (
        "from manim import *\n\nclass GeneratedScene(Scene):\n"
        "    def construct(self):\n        self.play(Write(Text('ok')))\n"
    )

    class FakeValidator:
        def __init__(self) -> None:
            self.calls = 0

        def validate(self, code: str):
            self.calls += 1
            if self.calls == 1:
                return SimpleNamespace(ok=False, errors=["Missing required class: GeneratedScene(Scene)"])
            return SimpleNamespace(ok=True, errors=[])

    class FakeJobService:
        def __init__(self) -> None:
            self.updates = []

        def update_job(self, job_id: str, **updates):
            self.updates.append((job_id, updates))
            return updates

    class FakeLLMService:
        def __init__(self) -> None:
            self.fix_calls = 0

        def fix_code(self, code: str, error: str) -> str:
            self.fix_calls += 1
            return fixed_code

    class FakeRenderOrchestrator:
        def run(self, job_id: str, code: str, quality: str):
            fd, tmp = tempfile.mkstemp(prefix=f"{job_id}_", suffix=".mp4")
            import os

            os.close(fd)
            return SimpleNamespace(video_file=tmp)

    class FakeStorageService:
        def put(self, job_id: str, src_file: str) -> str:
            return f"/data/videos/{job_id}.mp4"

    fake_job_service = FakeJobService()
    fake_llm_service = FakeLLMService()

    monkeypatch.setattr(tasks_render, "CodeValidator", FakeValidator)
    monkeypatch.setattr(tasks_render, "JobService", lambda: fake_job_service)
    monkeypatch.setattr(tasks_render, "LLMService", lambda: fake_llm_service)
    monkeypatch.setattr(tasks_render, "RenderOrchestrator", FakeRenderOrchestrator)
    monkeypatch.setattr(tasks_render, "StorageService", FakeStorageService)
    monkeypatch.setattr(tasks_render, "get_settings", lambda: SimpleNamespace(max_render_retries=2))

    tasks_render.process_render_job("job_test", initial_code, "1080p30", retry_on_error=True)

    assert fake_llm_service.fix_calls >= 1
    assert any(update.get("status") == "retrying" for _, update in fake_job_service.updates)
    assert any(update.get("status") == "done" for _, update in fake_job_service.updates)
