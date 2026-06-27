from app.services.skill_registry import SkillRegistry


def test_skill_registry_selects_stage_fragments() -> None:
    registry = SkillRegistry()
    context, provenance = registry.context_for("storyboard", ["narrative"], max_chars=4000)

    assert "Storyboard Narrative Arcs" in context
    assert provenance
    assert provenance[0]["id"] == "storyboard-narrative-arcs"
    assert registry.policy_version == "2026-06-skill-guided-v1"
    assert registry.target_runtime == "manimce-0.20.1"


def test_skill_registry_excludes_mismatched_runtime_guidance() -> None:
    registry = SkillRegistry()
    context, _provenance = registry.context_for("code", ["manimce"], max_chars=8000)

    assert "ManimCE Code Contract" in context
    assert "manimlib" not in context
    assert "InteractiveScene" not in context