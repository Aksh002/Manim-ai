from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

from app.workers import cleanup


class FakeJobs:
    def __init__(self) -> None:
        now = datetime.now(UTC)
        self.deleted: list[str] = []
        self.jobs = {
            "job_draft": _job("job_draft", now - timedelta(hours=25)),
            "job_final": _job("job_final", now - timedelta(hours=25)),
            "job_pinned": _job("job_pinned", now - timedelta(days=20)),
            "job_generic": _job("job_generic", now - timedelta(hours=90)),
        }

    def expired_job_ids(self, older_than_hours: int) -> list[str]:
        assert older_than_hours == 24
        return list(self.jobs)

    def get_job(self, job_id: str):
        return self.jobs[job_id]

    def delete_job(self, job_id: str) -> None:
        self.deleted.append(job_id)


class FakeStorage:
    def __init__(self) -> None:
        self.deleted: list[str] = []

    def delete(self, job_id: str) -> None:
        self.deleted.append(job_id)


def test_cleanup_uses_target_aware_render_retention(monkeypatch) -> None:
    fake_jobs = FakeJobs()
    fake_storage = FakeStorage()
    marked_deleted: list[str] = []
    now = datetime.now(UTC)
    renders = {
        "job_draft": _render("draft", False, now - timedelta(hours=25)),
        "job_final": _render("final", False, now - timedelta(hours=25)),
        "job_pinned": _render("final", True, now - timedelta(days=20)),
    }

    monkeypatch.setattr(cleanup, "JobService", lambda: fake_jobs)
    monkeypatch.setattr(cleanup, "StorageService", lambda: fake_storage)
    monkeypatch.setattr(
        cleanup,
        "get_settings",
        lambda: SimpleNamespace(
            job_retention_hours=72,
            artifact_retention_hours=72,
            draft_render_retention_hours=24,
            final_render_retention_hours=168,
        ),
    )
    monkeypatch.setattr(cleanup, "_get_session_render", lambda job_id: renders.get(job_id))
    monkeypatch.setattr(cleanup, "_mark_render_artifact_deleted", marked_deleted.append)

    result = cleanup.run_cleanup_once()

    assert result == {
        "deleted_jobs": 2,
        "deleted_artifacts": 2,
        "retained_pinned": 1,
        "retained_policy": 1,
    }
    assert fake_jobs.deleted == ["job_draft", "job_generic"]
    assert fake_storage.deleted == ["job_draft", "job_generic"]
    assert marked_deleted == ["job_draft"]


def _job(job_id: str, created_at: datetime) -> dict[str, object]:
    return {
        "job_id": job_id,
        "status": "done",
        "created_at": created_at.isoformat(),
    }


def _render(target: str, pinned: bool, created_at: datetime) -> dict[str, object]:
    return {
        "target": target,
        "pinned": pinned,
        "artifact_available": True,
        "artifact_expires_at": (datetime.now(UTC) - timedelta(hours=1)).isoformat(),
        "created_at": created_at,
    }
