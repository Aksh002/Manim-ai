from app.workers import tasks_render


def test_render_cache_is_written_only_after_success(monkeypatch) -> None:
    updates = []
    cached = []
    cleared = []

    class FakeCacheService:
        def set_render_artifact(self, render_hash: str, job_id: str) -> None:
            cached.append((render_hash, job_id))

        def clear_render_inflight(self, render_hash: str) -> None:
            cleared.append(render_hash)

    class FakeJobService:
        def update_job(self, job_id: str, **payload):
            updates.append(payload)
            return payload

    class FakeValidator:
        def validate(self, code: str):
            return type("Result", (), {"ok": False, "errors": ["bad"]})()

    class FakeStorageService:
        pass

    monkeypatch.setattr(tasks_render, "CacheService", FakeCacheService)
    monkeypatch.setattr(tasks_render, "JobService", FakeJobService)
    monkeypatch.setattr(tasks_render, "CodeValidator", FakeValidator)
    monkeypatch.setattr(tasks_render, "StorageService", FakeStorageService)
    monkeypatch.setattr(tasks_render, "get_settings", lambda: type("Settings", (), {"max_render_retries": 0})())

    tasks_render.process_render_job("job_test", "bad", "1080p30", False, "hash_1")

    assert cached == []
    assert cleared == ["hash_1"]
    assert updates[-1]["status"] == "failed"
