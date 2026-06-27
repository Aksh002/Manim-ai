# Quality And Repair Rules

When repairing generated code, preserve the original educational intent and improve only the failing
parts. Prefer deterministic fixes before asking the model.

Failure-specific guidance:

- Blank or tiny video: ensure visible mobjects are created, added, and animated; increase contrast.
- Weak motion: add clear transforms, camera movement, or object movement tied to the concept.
- Clutter: remove old objects, dim context, split one dense moment into progressive reveals.
- Text overlap or clipping: reduce font size, constrain width, increase edge buffer, or reposition.
- LaTeX error: replace prose labels with `Text`, keep only real formulas in `MathTex`, escape formula syntax.
- Unknown API: replace with documented ManimCE methods or define a helper explicitly.
- Timeout: simplify object count, remove expensive updaters, reduce animation complexity.
- Duration mismatch: cap long waits/run times and redistribute pauses around key moments.

Repair output must remain a single renderable `GeneratedScene`.
