from app.services.code_repairer import DeterministicCodeRepairer


def test_repairer_replaces_plain_tex_and_caps_long_timings() -> None:
    code = """
from manim import *

class GeneratedScene(Scene):
    def construct(self):
        label = Tex("x_1")
        self.play(Write(label), run_time=12)
        self.wait(10)
"""

    repaired, applied = DeterministicCodeRepairer().repair(code)

    assert "MathTex(\"x_1\")" in repaired
    assert "run_time=4" in repaired
    assert ".wait(3)" in repaired
    assert applied


def test_repairer_uses_text_for_plain_labels() -> None:
    code = 'from manim import *\n\nclass GeneratedScene(Scene):\n    def construct(self):\n        Tex("Input layer")\n'

    repaired, _ = DeterministicCodeRepairer().repair(code)

    assert 'Text("Input layer")' in repaired
