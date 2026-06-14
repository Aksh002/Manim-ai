from app.services.code_validator import CodeValidator


def test_code_validator_accepts_valid_script() -> None:
    code = """
from manim import *

class GeneratedScene(Scene):
    def construct(self):
        self.play(Write(Text("Hello")))
"""
    result = CodeValidator().validate(code)
    assert result.ok is True
    assert result.errors == []


def test_code_validator_blocks_unsafe_import() -> None:
    code = """
from manim import *
import os

class GeneratedScene(Scene):
    def construct(self):
        pass
"""
    result = CodeValidator().validate(code)
    assert result.ok is False
    assert any("Forbidden import" in err for err in result.errors)


def test_code_validator_requires_scene_contract() -> None:
    code = """
from manim import *

class WrongScene(Scene):
    def construct(self):
        pass
"""
    result = CodeValidator().validate(code)
    assert result.ok is False
    assert any("GeneratedScene" in err for err in result.errors)


def test_code_validator_blocks_unknown_scene_method() -> None:
    code = """
from manim import *

class GeneratedScene(Scene):
    def construct(self):
        self.play_and_wait(Write(Text("Hello")))
"""
    result = CodeValidator().validate(code)
    assert result.ok is False
    assert any("Unknown Scene method" in err for err in result.errors)


def test_code_validator_allows_defined_helper_method() -> None:
    code = """
from manim import *

class GeneratedScene(Scene):
    def helper(self):
        self.play(Write(Text("Hello")))

    def construct(self):
        self.helper()
"""
    result = CodeValidator().validate(code)
    assert result.ok is True


def test_code_validator_blocks_dynamic_escape_hatches() -> None:
    code = """
from manim import *

class GeneratedScene(Scene):
    def construct(self):
        getattr(__builtins__, "open")
"""
    result = CodeValidator().validate(code)
    assert result.ok is False
    assert any("Forbidden call: getattr" in err for err in result.errors)
    assert any("Forbidden dunder name" in err for err in result.errors)


def test_code_validator_rejects_tex_but_allows_text_and_mathtex() -> None:
    bad_code = """
from manim import *

class GeneratedScene(Scene):
    def construct(self):
        self.play(Write(Tex("x_1")))
"""
    bad_result = CodeValidator().validate(bad_code)
    assert bad_result.ok is False
    assert any("Unsupported Tex call" in err for err in bad_result.errors)

    good_code = """
from manim import *

class GeneratedScene(Scene):
    def construct(self):
        self.play(Write(Text("Input x1")))
        self.play(Write(MathTex("x_1")))
"""
    good_result = CodeValidator().validate(good_code)
    assert good_result.ok is True
