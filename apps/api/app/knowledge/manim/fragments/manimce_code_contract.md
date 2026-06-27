# ManimCE Code Contract

Runtime target: Manim Community Edition 0.20.1. Generate robust code that also avoids fragile
patterns observed in older ManimCE versions.

Hard contract:

- Return Python code only.
- Use exactly `from manim import *`.
- Define exactly `class GeneratedScene(Scene):`.
- Implement `construct(self)`.
- Keep logical sections as helper methods inside `GeneratedScene`; do not create multiple Scene classes.
- Do not use unsafe imports, file access, network access, subprocesses, or system calls.
- Do not invent Scene methods such as `play_and_wait`, `_set_background`, or `_add_area`.
- Helper methods are allowed only when explicitly defined in `GeneratedScene`.
- Use `Text(...)` for prose, titles, captions, and plain labels.
- Use `MathTex(...)` only for formulas.
- Avoid `Tex(...)`.

Implementation rules:

- Define shared constants for background, colors, font sizes, and timing.
- Set `self.camera.background_color`.
- Use `VGroup`/`Group` for related objects and cleanup.
- Use `Transform`, `ReplacementTransform`, or `TransformMatchingTex` where continuity matters.
- Add `self.wait(...)` after every important reveal.
- Keep waits and run times inside the requested duration budget.
- Keep mobject counts modest and layouts readable at 480p draft quality.
- End with a clean final frame or cleanup, not accidental overlap.
