import pytest

from app.schemas.generate import GenerateRequest, LevelPreset, StylePreset
from app.services import llm_service


def _settings(allow_llm_fallback: bool):
    return type(
        "Settings",
        (),
        {
            "llm_base_url": "https://example.lightning.ai/v1",
            "llm_api_key": "",
            "llm_model": "qwen3-coder",
            "llm_max_tokens": 2048,
            "llm_system_prompt": "",
            "llm_request_timeout_sec": 1,
            "allow_llm_fallback": allow_llm_fallback,
        },
    )()


def test_llm_generation_fails_without_explicit_fallback(monkeypatch):
    monkeypatch.setattr(llm_service, "get_settings", lambda: _settings(False))
    service = llm_service.LLMService()
    payload = GenerateRequest(
        topic="Triangles",
        duration_seconds=30,
        style=StylePreset.MINIMAL,
        level=LevelPreset.SCHOOL,
        additional_instructions="",
    )

    with pytest.raises(RuntimeError):
        service.generate_code(payload)


def test_llm_generation_uses_explicit_fallback(monkeypatch):
    monkeypatch.setattr(llm_service, "get_settings", lambda: _settings(True))
    service = llm_service.LLMService()
    payload = GenerateRequest(
        topic="Triangles",
        duration_seconds=30,
        style=StylePreset.MINIMAL,
        level=LevelPreset.SCHOOL,
        additional_instructions="",
    )

    code, warnings, source = service.generate_code(payload)

    assert "GeneratedScene" in code
    assert warnings
    assert source == "fallback"
