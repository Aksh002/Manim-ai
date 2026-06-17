from __future__ import annotations

from pathlib import Path

from app.sandbox.docker_runner import DockerRunner


SMOKE_CASES = {
    "text": '''from manim import *

class GeneratedScene(Scene):
    def construct(self):
        self.play(Write(Text("Renderer smoke")))
        self.wait(0.1)
''',
    "mathtex": r'''from manim import *

class GeneratedScene(Scene):
    def construct(self):
        formula = MathTex(r"y = \sigma(Wx + b)")
        self.play(Write(formula))
        self.wait(0.1)
''',
    "golden_mlp": r'''from manim import *

class GeneratedScene(Scene):
    def construct(self):
        title = Text("Multilevel Perceptron", font_size=34).to_edge(UP)
        formula = MathTex(r"y = \sigma(Wx + b)", font_size=32).to_edge(DOWN)
        neurons = VGroup()
        for x, count, color in [(-3, 3, BLUE), (0, 4, GREEN), (3, 1, ORANGE)]:
            for index in range(count):
                neuron = Circle(radius=0.18, color=color).move_to([x, (count - 1) * 0.35 - index * 0.7, 0])
                neurons.add(neuron)
        self.play(Write(title), FadeIn(neurons), Write(formula))
        self.wait(0.1)
''',
}


def main() -> None:
    runner = DockerRunner()
    for name, code in SMOKE_CASES.items():
        result = runner.run(f"smoke_{name}", code, "480p15")
        path = Path(result.video_file)
        if not path.exists() or path.stat().st_size <= 0:
            raise RuntimeError(f"Renderer smoke failed for {name}: empty video")
        print(f"{name}: {path.stat().st_size} bytes")
        path.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
