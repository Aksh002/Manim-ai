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


def test_structured_generation_uses_skill_guided_stage_payloads(monkeypatch) -> None:
    settings = _fake_settings(generation_pipeline_mode="structured")
    monkeypatch.setattr(llm_service, "get_settings", lambda: settings)
    service = llm_service.LLMService()
    captured = []
    responses = [
        {
            "title": "Triangles",
            "core_visual_thesis": "Squares reveal the relation.",
            "audience": "school",
            "learning_objective": "Understand a^2+b^2=c^2 visually.",
            "misconception": "The formula is arbitrary.",
            "hook": "Why do three squares fit?",
            "narrative_arc": "Discovery",
            "aha_moment": "Area is conserved.",
            "visual_metaphor": "Rearranging area",
            "color_semantics": {"blue": "leg squares"},
            "beats": [
                {"purpose": "Show a right triangle", "before_state": "empty", "after_state": "triangle", "motion_intent": "create", "duration_seconds": 8, "transition": "carry"},
                {"purpose": "Build squares", "before_state": "triangle", "after_state": "three squares", "motion_intent": "grow", "duration_seconds": 10, "transition": "transform"},
                {"purpose": "Reveal equal area", "before_state": "squares", "after_state": "formula", "motion_intent": "highlight", "duration_seconds": 12, "transition": "resolve"},
            ],
            "final_takeaway": "The equation tracks area.",
        },
        {
            "sections": [
                {"name": "Hook", "duration_seconds": 10},
                {"name": "Build", "duration_seconds": 10},
                {"name": "Reveal", "duration_seconds": 10},
            ],
            "objects": ["triangle", "squares"],
            "timings": {"total": 30},
            "transitions": ["carry-forward"],
            "labels": ["a", "b", "c"],
            "formulas": ["a^2+b^2=c^2"],
            "color_palette": {"primary": "BLUE"},
            "layout_strategy": "center visual, bottom formula",
            "risks": ["text overlap"],
            "implementation_notes": ["single GeneratedScene"],
        },
        "```python\nfrom manim import *\n\nclass GeneratedScene(Scene):\n    def construct(self):\n        self.play(Write(Text('Triangles')))\n        self.wait(1)\n```",
    ]

    class FakeResponse:
        is_error = False

        def __init__(self, content):
            self.content = content

        def json(self):
            return {"choices": [{"message": {"content": self.content}}]}

    class FakeClient:
        def post(self, url, headers, json):
            captured.append(json)
            content = responses.pop(0)
            if not isinstance(content, str):
                content = __import__("json").dumps(content)
            return FakeResponse(content)

    service.client = FakeClient()
    payload = __import__("app.schemas.generate", fromlist=["GenerateRequest", "StylePreset", "LevelPreset"])
    request = payload.GenerateRequest(
        topic="Explain the Pythagorean theorem visually",
        duration_seconds=30,
        style=payload.StylePreset.GEOMETRIC_HEAVY,
        level=payload.LevelPreset.SCHOOL,
        additional_instructions="",
    )

    code, warnings, source, metadata = service.generate_code_with_metadata(request)

    assert source == "llm"
    assert not warnings
    assert "GeneratedScene" in code
    assert metadata["storyboard_document"]["aha_moment"] == "Area is conserved."
    assert metadata["planning_report"]["passed"] is True
    assert metadata["skill_provenance"]["selected_fragments"]
    assert captured[0]["max_tokens"] == 1500
    assert captured[1]["max_tokens"] == 3000
    assert captured[2]["max_tokens"] == 6000
    assert "Storyboard Narrative Arcs" in captured[0]["messages"][1]["content"]
    assert "ManimCE Code Contract" in captured[2]["messages"][1]["content"]