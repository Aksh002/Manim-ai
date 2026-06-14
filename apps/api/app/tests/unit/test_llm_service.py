from types import SimpleNamespace

from app.services import llm_service


def _fake_settings(**overrides):
    base = {
        "llm_base_url": "https://example.lightning.ai/v1",
        "llm_api_key": "token",
        "llm_model": "qwen3-coder",
        "llm_max_tokens": 2048,
        "llm_system_prompt": "",
        "llm_request_timeout_sec": 120,
        "allow_llm_fallback": False,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_model_name_uses_llm_model(monkeypatch) -> None:
    monkeypatch.setattr(llm_service, "get_settings", lambda: _fake_settings())
    service = llm_service.LLMService()
    assert service.model_name == "qwen3-coder"
    assert service.provider == "openai_compatible"


def test_chat_url_accepts_v1_base(monkeypatch) -> None:
    monkeypatch.setattr(llm_service, "get_settings", lambda: _fake_settings())
    service = llm_service.LLMService()
    assert service._chat_completions_url() == "https://example.lightning.ai/v1/chat/completions"


def test_chat_url_accepts_full_endpoint(monkeypatch) -> None:
    monkeypatch.setattr(
        llm_service,
        "get_settings",
        lambda: _fake_settings(llm_base_url="https://example.lightning.ai/v1/chat/completions"),
    )
    service = llm_service.LLMService()
    assert service._chat_completions_url() == "https://example.lightning.ai/v1/chat/completions"


def test_generate_uses_openai_compatible_chat_payload(monkeypatch) -> None:
    monkeypatch.setattr(llm_service, "get_settings", lambda: _fake_settings())
    service = llm_service.LLMService()
    captured = {}

    class FakeResponse:
        is_error = False

        @staticmethod
        def json():
            return {"choices": [{"message": {"content": "```python\nprint('ok')\n```"}}]}

    class FakeClient:
        @staticmethod
        def post(url, headers, json):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return FakeResponse()

    service.client = FakeClient()

    text = service._generate("make code", temperature=0.2)

    assert "print('ok')" in text
    assert captured["url"] == "https://example.lightning.ai/v1/chat/completions"
    assert captured["headers"]["Authorization"] == "Bearer token"
    assert captured["json"]["model"] == "qwen3-coder"
    assert captured["json"]["messages"][0]["role"] == "system"
    assert captured["json"]["messages"][1] == {"role": "user", "content": "make code"}
    assert captured["json"]["temperature"] == 0.2
    assert captured["json"]["max_tokens"] == 2048
