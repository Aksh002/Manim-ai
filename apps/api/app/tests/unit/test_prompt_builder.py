from app.schemas.generate import GenerateRequest, LevelPreset, StylePreset
from app.services.prompt_builder import build_generation_prompt


def test_prompt_builder_includes_key_constraints() -> None:
    payload = GenerateRequest(
        topic="Explain quadratic formula",
        duration_seconds=60,
        style=StylePreset.COLORFUL,
        level=LevelPreset.SCHOOL,
        additional_instructions="Use graph transitions.",
    )

    prompt = build_generation_prompt(payload)
    assert "from manim import *" in prompt
    assert "GeneratedScene" in prompt
    assert "quadratic formula" in prompt.lower()
    assert "60 seconds" in prompt
    assert "Do not use `Tex(...)`" in prompt
    assert "MathTex" in prompt
