from fastapi.testclient import TestClient

from app.api.deps import get_job_service, get_queue_service
from app.main import app
from app.services.job_service import JobService


class FakeQueueService:
    def cancel_queued_job(self, job_id: str) -> bool:
        return True


def test_cancel_queued_job_requires_owner_and_marks_cancelled() -> None:
    job_service = JobService()
    job = job_service.create_job(owner_token="secret", input_code="from manim import *")
    app.dependency_overrides[get_job_service] = lambda: job_service
    app.dependency_overrides[get_queue_service] = lambda: FakeQueueService()

    client = TestClient(app)
    assert client.post(f"/jobs/{job['job_id']}/cancel", params={"owner_token": "wrong"}).status_code == 403

    response = client.post(f"/jobs/{job['job_id']}/cancel", params={"owner_token": "secret"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "cancelled"
    assert body["cancellable"] is False
    app.dependency_overrides.clear()
