# Generation Quality Policy

Manim_AI uses a curated, versioned Manim knowledge pack during prompt-to-code generation. The
runtime does not download Skills.sh packages or execute upstream skill instructions. Source skill
packages are review inputs only.

## Sources

- NousResearch Hermes `manim-video`, MIT license: primary planning, design, production-quality,
  troubleshooting, and ManimCE guidance.
- Adithya S K `manim_skill`, MIT license: supplemental educational narrative and visual technique
  guidance.

## Runtime Rules

- Production loads only files under `apps/api/app/knowledge/manim`.
- The active policy is identified by `SKILL_POLICY_VERSION` and the manifest policy hash.
- ManimGL guidance is excluded from runtime context.
- Security, sandbox, and the single `GeneratedScene` contract override skill guidance.
- Skill fragment IDs and hashes are returned in `/generate` metadata for auditability.
- Generation cache identity includes the skill policy and curated manifest hash.

## Pipeline

The structured generator now uses curated context by stage:

- storyboard: narrative arc, misconception, hook, aha moment, visual beats;
- scene plan: sections, layout, semantic colors, timings, risks;
- optional critic: runs only when deterministic planning checks score below threshold;
- code: ManimCE contract and production readability rules;
- repair: failure-specific repair guidance.

Renderer images target ManimCE `0.20.1`; rebuild renderer images after changing `MANIM_VERSION`.
