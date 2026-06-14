from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app


def test_generate_route_returns_code() -> None:
    settings = get_settings()
    settings.allow_llm_fallback = True
    client = TestClient(app)
    payload = {
        "topic": "Explain the Pythagorean theorem visually",
        "duration_seconds": 60,
        "style": "geometric-heavy",
        "level": "school",
        "additional_instructions": "Use geometric proof",
    }
    response = client.post("/generate", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert "code" in body
    assert "class GeneratedScene(Scene)" in body["code"]
    assert body["source"] in {"fallback", "llm", "cache"}
