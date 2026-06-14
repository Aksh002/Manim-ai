from fastapi.testclient import TestClient

from app.api.deps import get_job_service, get_storage_service
from app.core.config import get_settings
from app.main import app


class FakeStorageService:
    def get(self, job_id: str):
        return None


def test_render_then_status_flow(monkeypatch, tmp_path) -> None:
    settings = get_settings()
    settings.use_queue = False
    app.dependency_overrides[get_storage_service] = lambda: FakeStorageService()

    def fake_task(
        job_id: str,
        code: str,
        quality: str,
        retry_on_error: bool = True,
        render_hash: str | None = None,
    ) -> None:
        return None

    monkeypatch.setattr("app.api.routes_render.process_render_job", fake_task)

    client = TestClient(app)
    render_payload = {
        "code": "from manim import *\\n\\nclass GeneratedScene(Scene):\\n    def construct(self):\\n        pass\\n",
        "quality": "1080p30",
        "retry_on_error": True,
    }
    response = client.post("/render", json=render_payload)
    assert response.status_code == 202
    body = response.json()
    job_id = body["job_id"]
    owner_token = body["owner_token"]

    status_response = client.get(f"/status/{job_id}", params={"owner_token": owner_token})
    assert status_response.status_code == 200
    assert status_response.json()["status"] == "queued"
    app.dependency_overrides.clear()


def test_status_requires_job_owner_token(monkeypatch) -> None:
    settings = get_settings()
    settings.use_queue = False
    app.dependency_overrides[get_storage_service] = lambda: FakeStorageService()

    def fake_task(
        job_id: str,
        code: str,
        quality: str,
        retry_on_error: bool = True,
        render_hash: str | None = None,
    ) -> None:
        return None

    monkeypatch.setattr("app.api.routes_render.process_render_job", fake_task)

    client = TestClient(app)
    response = client.post(
        "/render",
        json={
            "code": "from manim import *\n\nclass GeneratedScene(Scene):\n    def construct(self):\n        pass\n",
            "quality": "1080p30",
            "retry_on_error": True,
        },
    )
    assert response.status_code == 202
    job_id = response.json()["job_id"]

    assert client.get(f"/status/{job_id}").status_code == 403
    assert client.get(f"/status/{job_id}", params={"owner_token": "wrong"}).status_code == 403
    app.dependency_overrides.clear()


def test_video_requires_job_owner_token(tmp_path) -> None:
    video_file = tmp_path / "job_private.mp4"
    video_file.write_bytes(b"mp4")

    class FakeJobService:
        def get_job(self, job_id: str):
            return {
                "job_id": job_id,
                "status": "done",
                "owner_token": "secret",
            }

    class ReadyStorageService:
        def get(self, job_id: str):
            return str(video_file)

    app.dependency_overrides[get_job_service] = lambda: FakeJobService()
    app.dependency_overrides[get_storage_service] = lambda: ReadyStorageService()
    client = TestClient(app)

    assert client.get("/video/job_private").status_code == 403
    assert client.get("/video/job_private", params={"owner_token": "wrong"}).status_code == 403
    assert client.get("/video/job_private", params={"owner_token": "secret"}).status_code == 200
    app.dependency_overrides.clear()


def test_render_accepts_invalid_code_when_retry_enabled(monkeypatch) -> None:
    settings = get_settings()
    settings.use_queue = False
    app.dependency_overrides[get_storage_service] = lambda: FakeStorageService()

    def fake_task(
        job_id: str,
        code: str,
        quality: str,
        retry_on_error: bool = True,
        render_hash: str | None = None,
    ) -> None:
        return None

    monkeypatch.setattr("app.api.routes_render.process_render_job", fake_task)

    client = TestClient(app)
    invalid_payload = {
        "code": "from manim import *\n\nclass Wrong(Scene):\n    def construct(self):\n        pass\n",
        "quality": "1080p30",
        "retry_on_error": True,
    }
    response = client.post("/render", json=invalid_payload)
    assert response.status_code == 202
    app.dependency_overrides.clear()


def test_render_rejects_unknown_quality(monkeypatch) -> None:
    settings = get_settings()
    settings.use_queue = False
    app.dependency_overrides[get_storage_service] = lambda: FakeStorageService()
    client = TestClient(app)
    response = client.post(
        "/render",
        json={
            "code": "from manim import *\n\nclass GeneratedScene(Scene):\n    def construct(self):\n        pass\n",
            "quality": "massive",
            "retry_on_error": True,
        },
    )
    assert response.status_code == 422
    app.dependency_overrides.clear()
