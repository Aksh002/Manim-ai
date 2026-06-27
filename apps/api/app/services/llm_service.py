import logging
import json
import re
from typing import Any

import httpx

from app.core.config import get_settings
from app.schemas.generate import GenerateRequest
from app.services.prompt_builder import build_generation_prompt
from app.services.skill_registry import get_skill_registry

logger = logging.getLogger(__name__)

DEFAULT_SYSTEM_PROMPT = (
    "You are an expert Manim educator and senior Python engineer. "
    "Generate clean, correct, secure Manim CE code."
)


class LLMService:
    def __init__(self, provider_config: dict[str, str] | None = None) -> None:
        self.settings = get_settings()
        self.client = httpx.Client(timeout=self.settings.llm_request_timeout_sec)
        self.provider_config = provider_config or {}
        self.skill_registry = get_skill_registry()

    @property
    def provider(self) -> str:
        return "openai_compatible"

    @property
    def model_name(self) -> str:
        return self.provider_config.get("model") or self.settings.llm_model

    @property
    def base_url(self) -> str:
        return self.provider_config.get("base_url") or self.settings.llm_base_url

    @property
    def api_key(self) -> str:
        return self.provider_config.get("api_key") or self.settings.llm_api_key

    def _chat_completions_url(self) -> str:
        base_url = self.base_url.strip().rstrip("/")
        if not base_url:
            raise RuntimeError("LLM_BASE_URL is not configured")
        if base_url.endswith("/v1/chat/completions"):
            return base_url
        if base_url.endswith("/chat/completions"):
            return base_url
        if base_url.endswith("/v1"):
            return f"{base_url}/chat/completions"
        return f"{base_url}/v1/chat/completions"

    def _extract_code(self, text: str) -> str:
        fenced = re.findall(r"```(?:python)?\s*([\s\S]*?)```", text, flags=re.IGNORECASE)
        if fenced:
            return fenced[0].strip()
        return text.strip()

    def _extract_json(self, text: str) -> Any:
        fenced = re.findall(r"```(?:json)?\s*([\s\S]*?)```", text, flags=re.IGNORECASE)
        candidate = fenced[0].strip() if fenced else text.strip()
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            start = candidate.find("{")
            end = candidate.rfind("}")
            if start >= 0 and end > start:
                return json.loads(candidate[start : end + 1])
            start = candidate.find("[")
            end = candidate.rfind("]")
            if start >= 0 and end > start:
                return json.loads(candidate[start : end + 1])
            raise

    def _fallback_code(self, topic: str) -> str:
        safe_topic = topic.replace('"', "'")
        return f'''from manim import *

class GeneratedScene(Scene):
    def construct(self):
        title = Text("{safe_topic}", font_size=48)
        self.play(Write(title))
        self.wait(1)
'''

    def _extract_chat_content(self, body: dict[str, Any]) -> str:
        choices = body.get("choices")
        if not isinstance(choices, list) or not choices:
            raise RuntimeError("LLM returned no choices")

        first = choices[0]
        if not isinstance(first, dict):
            raise RuntimeError("LLM returned an invalid choice")

        message = first.get("message")
        content: Any = message.get("content") if isinstance(message, dict) else first.get("text")

        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                if isinstance(item, dict):
                    text = item.get("text") or item.get("content")
                    if isinstance(text, str):
                        parts.append(text)
            content = "\n".join(parts)

        if not isinstance(content, str) or not content.strip():
            raise RuntimeError("LLM returned empty content")
        return content

    def _stage_max_tokens(self, stage: str) -> int:
        defaults = {
            "storyboard": 1500,
            "scene_plan": 3000,
            "critic": 3000,
            "code": 6000,
            "repair": 4000,
        }
        attr_by_stage = {
            "storyboard": "llm_storyboard_max_tokens",
            "scene_plan": "llm_scene_plan_max_tokens",
            "critic": "llm_scene_plan_max_tokens",
            "code": "llm_code_max_tokens",
            "repair": "llm_repair_max_tokens",
        }
        attr = attr_by_stage.get(stage)
        if attr:
            return int(getattr(self.settings, attr, defaults[stage]))
        return int(getattr(self.settings, "llm_max_tokens", 2048))

    def _generate(
        self,
        prompt: str,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> str:
        if not self.api_key:
            raise RuntimeError("LLM_API_KEY is not configured")
        if not self.model_name:
            raise RuntimeError("LLM_MODEL is not configured")

        payload: dict[str, Any] = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": self.settings.llm_system_prompt or DEFAULT_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            "max_tokens": max_tokens or self.settings.llm_max_tokens,
        }
        if temperature is not None:
            payload["temperature"] = temperature

        response = self.client.post(
            self._chat_completions_url(),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            json=payload,
        )
        if response.is_error:
            detail = response.text.strip()
            if len(detail) > 500:
                detail = f"{detail[:500]}..."
            raise RuntimeError(f"LLM request failed with {response.status_code}: {detail}")

        return self._extract_chat_content(response.json())

    def _skill_context(self, stage: str, tags: list[str] | None = None) -> tuple[str, list[dict[str, str]]]:
        max_chars = int(getattr(self.settings, "skill_context_max_chars", 6000))
        if max_chars <= 0:
            return "", []
        return self.skill_registry.context_for(stage=stage, tags=tags or [], max_chars=max_chars)

    def _skill_provenance(self, selected: list[dict[str, str]]) -> dict[str, Any]:
        summary = self.skill_registry.provenance_summary()
        summary["selected_fragments"] = selected
        summary["configured_policy_version"] = getattr(
            self.settings, "skill_policy_version", summary["policy_version"]
        )
        return summary

    def generate_code(self, payload: GenerateRequest) -> tuple[str, list[str], str]:
        code, warnings, source, _metadata = self.generate_code_with_metadata(payload)
        return code, warnings, source

    def generate_code_with_metadata(
        self, payload: GenerateRequest
    ) -> tuple[str, list[str], str, dict[str, Any]]:
        if getattr(self.settings, "generation_pipeline_mode", "legacy") == "structured":
            return self._generate_structured(payload)

        prompt = build_generation_prompt(payload)
        try:
            raw = self._generate(prompt=prompt, temperature=0.2)
            return self._extract_code(raw), [], "llm", {
                "pipeline_mode": "legacy",
                "generation_attempts": [{"phase": "code", "source": "llm"}],
                "manim_version": getattr(self.settings, "manim_version", None),
            }
        except Exception as exc:
            if not self.settings.allow_llm_fallback:
                raise
            logger.warning("Primary LLM generation failed, using fallback template: %s", exc)
            message = str(exc).strip()
            if len(message) > 260:
                message = f"{message[:260]}..."
            return self._fallback_code(payload.topic), [
                f"LLM unavailable ({self.provider}): {message}. Using fallback template"
            ], "fallback", {
                "pipeline_mode": "legacy",
                "generation_attempts": [{"phase": "fallback", "error": message}],
                "manim_version": getattr(self.settings, "manim_version", None),
            }

    def _generate_structured(
        self, payload: GenerateRequest
    ) -> tuple[str, list[str], str, dict[str, Any]]:
        attempts: list[dict[str, Any]] = []
        warnings: list[str] = []
        selected_fragments: list[dict[str, str]] = []
        storyboard_document: dict[str, Any] = {}
        storyboard: list[str] = []
        scene_plan: dict[str, Any] = {}
        planning_report: dict[str, Any] = {}

        try:
            storyboard_context, provenance = self._skill_context(
                "storyboard", ["narrative", "pedagogy", "visual"]
            )
            selected_fragments.extend(provenance)
            storyboard_prompt = f"""
Create a structured storyboard for a Manim educational animation.
Return JSON only with keys: title, core_visual_thesis, audience, learning_objective,
misconception, hook, narrative_arc, aha_moment, visual_metaphor, color_semantics,
beats, final_takeaway.

Each beat must be an object with keys: purpose, before_state, after_state,
motion_intent, duration_seconds, transition.
Use 3 to 7 beats total. Keep the total duration near {payload.duration_seconds} seconds.

Curated Manim explainer guidance:
{storyboard_context}

Topic: {payload.topic}
Audience level: {payload.level.value}
Duration seconds: {payload.duration_seconds}
Style: {payload.style.value}
Additional instructions: {payload.additional_instructions or 'None'}
""".strip()
            raw_storyboard = self._generate(
                storyboard_prompt,
                temperature=0.2,
                max_tokens=self._stage_max_tokens("storyboard"),
            )
            parsed_storyboard = self._extract_json(raw_storyboard)
            if not isinstance(parsed_storyboard, dict):
                raise ValueError("Storyboard was not a JSON object")
            storyboard_document = parsed_storyboard
            storyboard = self._summarize_storyboard(parsed_storyboard)
            attempts.append(
                {
                    "phase": "storyboard",
                    "source": "llm",
                    "ok": True,
                    "skill_fragments": [item["id"] for item in provenance],
                }
            )

            plan_context, provenance = self._skill_context(
                "scene_plan", ["layout", "pacing", "quality", "visual"]
            )
            selected_fragments.extend(provenance)
            plan_prompt = f"""
Create a Manim scene plan from this storyboard.
Return JSON only with keys: sections, objects, timings, transitions, labels, formulas,
color_palette, layout_strategy, risks, implementation_notes.

Rules:
- Preserve a single final `GeneratedScene`; logical sections may become helper methods.
- Prefer Text for prose labels and MathTex only for formulas. Avoid Tex entirely.
- Include before/after visual states, animation sequence, duration, and cleanup notes per section.
- Keep active focal elements modest and readable at 480p draft quality.

Curated planning guidance:
{plan_context}

Storyboard JSON:
{json.dumps(storyboard_document, indent=2)}
""".strip()
            raw_plan = self._generate(
                plan_prompt,
                temperature=0.2,
                max_tokens=self._stage_max_tokens("scene_plan"),
            )
            parsed_plan = self._extract_json(raw_plan)
            if not isinstance(parsed_plan, dict):
                raise ValueError("Scene plan was not a JSON object")
            scene_plan = parsed_plan
            planning_report = self._score_plan(storyboard_document, scene_plan, payload.duration_seconds)
            attempts.append(
                {
                    "phase": "scene_plan",
                    "source": "llm",
                    "ok": True,
                    "planning_score": planning_report.get("score"),
                    "skill_fragments": [item["id"] for item in provenance],
                }
            )

            scene_plan, planning_report, critic_attempt = self._maybe_critique_plan(
                payload=payload,
                storyboard_document=storyboard_document,
                scene_plan=scene_plan,
                planning_report=planning_report,
                selected_fragments=selected_fragments,
            )
            if critic_attempt:
                attempts.append(critic_attempt)

            code_context, provenance = self._skill_context(
                "code", ["manimce", "contract", "layout", "pacing"]
            )
            selected_fragments.extend(provenance)
            code_prompt = f"""
Generate complete Manim CE Python code from this storyboard and scene plan.

Hard constraints:
- Return code only.
- Use `from manim import *`.
- Define exactly `class GeneratedScene(Scene):`.
- Implement logical sections as helper methods inside `GeneratedScene` if useful.
- Use valid Manim CE {getattr(self.settings, 'manim_version', '0.20.1')} APIs only.
- Use Text for prose and labels. Use MathTex only for formulas. Never use Tex.
- Keep total runtime near {payload.duration_seconds} seconds.
- Keep object counts modest and animations clear.

Curated code guidance:
{code_context}

Original topic: {payload.topic}
Storyboard JSON:
{json.dumps(storyboard_document, indent=2)}
Scene plan JSON:
{json.dumps(scene_plan, indent=2)}
Planning report JSON:
{json.dumps(planning_report, indent=2)}
""".strip()
            raw_code = self._generate(
                code_prompt,
                temperature=0.15,
                max_tokens=self._stage_max_tokens("code"),
            )
            code = self._extract_code(raw_code)
            attempts.append(
                {
                    "phase": "code",
                    "source": "llm",
                    "ok": True,
                    "skill_fragments": [item["id"] for item in provenance],
                }
            )
            return code, warnings, "llm", {
                "pipeline_mode": "structured",
                "storyboard": storyboard,
                "storyboard_document": storyboard_document,
                "scene_plan": scene_plan,
                "planning_report": planning_report,
                "skill_provenance": self._skill_provenance(selected_fragments),
                "generation_attempts": attempts,
                "manim_version": getattr(self.settings, "manim_version", None),
            }
        except Exception as exc:
            attempts.append({"phase": "structured_fallback", "source": "llm", "ok": False, "error": str(exc)})
            warnings.append(f"Structured generation failed, falling back to legacy prompt: {exc}")
            original_mode = getattr(self.settings, "generation_pipeline_mode", "legacy")
            self.settings.generation_pipeline_mode = "legacy"
            try:
                code, legacy_warnings, source, metadata = self.generate_code_with_metadata(payload)
            finally:
                self.settings.generation_pipeline_mode = original_mode
            warnings.extend(legacy_warnings)
            metadata.update(
                {
                    "pipeline_mode": "structured",
                    "storyboard": storyboard or None,
                    "storyboard_document": storyboard_document or None,
                    "scene_plan": scene_plan or None,
                    "planning_report": planning_report or None,
                    "skill_provenance": self._skill_provenance(selected_fragments),
                    "generation_attempts": attempts + metadata.get("generation_attempts", []),
                    "manim_version": getattr(self.settings, "manim_version", None),
                }
            )
            return code, warnings, source, metadata

    def _summarize_storyboard(self, storyboard_document: dict[str, Any]) -> list[str]:
        beats = storyboard_document.get("beats")
        if not isinstance(beats, list):
            return []
        summary: list[str] = []
        for beat in beats[:7]:
            if isinstance(beat, dict):
                purpose = beat.get("purpose") or beat.get("motion_intent") or beat.get("after_state")
                if purpose:
                    summary.append(str(purpose))
            elif isinstance(beat, str):
                summary.append(beat)
        return summary

    def _score_plan(
        self,
        storyboard_document: dict[str, Any],
        scene_plan: dict[str, Any],
        requested_duration: int,
    ) -> dict[str, Any]:
        checks: list[dict[str, Any]] = []

        def add(name: str, passed: bool, suggestion: str) -> None:
            checks.append({"name": name, "passed": passed, "suggestion": None if passed else suggestion})

        beats = storyboard_document.get("beats")
        sections = scene_plan.get("sections")
        color_palette = scene_plan.get("color_palette")
        risks = scene_plan.get("risks")
        timings = scene_plan.get("timings")

        add("storyboard_has_beats", isinstance(beats, list) and 3 <= len(beats) <= 7, "Use 3 to 7 visual beats.")
        add("plan_has_sections", isinstance(sections, list) and len(sections) >= 1, "Plan logical sections before code.")
        add("has_color_semantics", bool(storyboard_document.get("color_semantics") or color_palette), "Assign semantic color meanings.")
        add("has_aha_moment", bool(storyboard_document.get("aha_moment")), "Name the key insight or aha moment.")
        add("has_risks", bool(risks), "List implementation and visual risks.")
        add("has_timing", bool(timings or self._section_duration_total(sections)), "Budget time per section.")

        total_duration = self._section_duration_total(sections)
        if total_duration:
            duration_ok = abs(total_duration - requested_duration) <= max(10, requested_duration * 0.35)
            add("duration_budget_close", duration_ok, "Make planned duration closer to the requested duration.")
        else:
            add("duration_budget_close", False, "Add section duration estimates.")

        passed = sum(1 for check in checks if check["passed"])
        score = round(passed / max(len(checks), 1), 3)
        return {
            "score": score,
            "passed": score >= float(getattr(self.settings, "planner_critic_threshold", 0.72)),
            "checks": checks,
            "requested_duration_seconds": requested_duration,
            "planned_duration_seconds": total_duration,
        }

    def _section_duration_total(self, sections: Any) -> float | None:
        if not isinstance(sections, list):
            return None
        total = 0.0
        found = False
        for section in sections:
            if not isinstance(section, dict):
                continue
            value = section.get("duration_seconds") or section.get("duration")
            if isinstance(value, (int, float)):
                total += float(value)
                found = True
        return round(total, 3) if found else None

    def _maybe_critique_plan(
        self,
        payload: GenerateRequest,
        storyboard_document: dict[str, Any],
        scene_plan: dict[str, Any],
        planning_report: dict[str, Any],
        selected_fragments: list[dict[str, str]],
    ) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any] | None]:
        if not bool(getattr(self.settings, "planner_critic_enabled", True)):
            return scene_plan, planning_report, None
        if float(planning_report.get("score", 1.0)) >= float(getattr(self.settings, "planner_critic_threshold", 0.72)):
            return scene_plan, planning_report, None

        critic_context, provenance = self._skill_context("scene_plan", ["quality", "layout", "pacing"])
        selected_fragments.extend(provenance)
        critic_prompt = f"""
Review and revise this Manim scene plan. Return JSON only with keys: scene_plan, planning_report.
Do not write code. Preserve the single GeneratedScene contract and the requested duration.

Curated critique guidance:
{critic_context}

Topic: {payload.topic}
Storyboard JSON:
{json.dumps(storyboard_document, indent=2)}
Current scene plan JSON:
{json.dumps(scene_plan, indent=2)}
Current planning report JSON:
{json.dumps(planning_report, indent=2)}
""".strip()
        try:
            raw = self._generate(
                critic_prompt,
                temperature=0.1,
                max_tokens=self._stage_max_tokens("critic"),
            )
            parsed = self._extract_json(raw)
            if not isinstance(parsed, dict) or not isinstance(parsed.get("scene_plan"), dict):
                raise ValueError("Critic output did not include a scene_plan object")
            revised_plan = parsed["scene_plan"]
            revised_report = parsed.get("planning_report")
            if not isinstance(revised_report, dict):
                revised_report = self._score_plan(storyboard_document, revised_plan, payload.duration_seconds)
            return revised_plan, revised_report, {
                "phase": "planner_critic",
                "source": "llm",
                "ok": True,
                "planning_score": revised_report.get("score"),
                "skill_fragments": [item["id"] for item in provenance],
            }
        except Exception as exc:
            return scene_plan, planning_report, {
                "phase": "planner_critic",
                "source": "llm",
                "ok": False,
                "error": str(exc),
                "skill_fragments": [item["id"] for item in provenance],
            }

    def fix_code(self, code: str, error: str) -> str:
        repair_context, _provenance = self._skill_context("repair", ["repair", "quality", "manimce"])
        prompt = f"""
Fix the following Manim script.
Constraints:
- Keep `GeneratedScene(Scene)` and `construct(self)`.
- Use only `from manim import *`.
- Target Manim CE {getattr(self.settings, 'manim_version', '0.20.1')}.
- No unsafe imports or system/file/network calls.
- Return code only.
- Do not call undefined/private methods on `self` (for example `_set_background`, `_add_area`).
- Do not invent methods like `play_and_wait`; use valid Scene APIs such as `play(...)` and `wait(...)`.
- Do not use `Tex(...)`. Use `Text(...)` for prose/labels and `MathTex(...)` only for formulas.
- If a LaTeX error mentions underscores, carets, or failed dvi conversion, replace bad `Tex(...)` labels with `Text(...)` or valid `MathTex(...)`.
- If you need helper methods, define them explicitly in `GeneratedScene`.
- Ensure final code can render directly with `manim ... GeneratedScene`.

Curated repair guidance:
{repair_context}

Runtime error:
{error}

Code:
{code}
""".strip()

        try:
            raw = self._generate(
                prompt=prompt,
                temperature=0.1,
                max_tokens=self._stage_max_tokens("repair"),
            )
            return self._extract_code(raw)
        except Exception:
            return code

    def regenerate_with_instruction(self, code: str, instruction: str) -> str:
        code_context, _provenance = self._skill_context("code", ["manimce", "contract"])
        prompt = f"""
Revise this Manim script based on the instruction.
Constraints:
- Keep `GeneratedScene(Scene)` and `construct(self)`.
- Use only `from manim import *`.
- Target Manim CE {getattr(self.settings, 'manim_version', '0.20.1')}.
- No unsafe imports or system/file/network calls.
- Return code only.
- Do not use `Tex(...)`. Use `Text(...)` for prose/labels and `MathTex(...)` only for formulas.

Curated code guidance:
{code_context}

Instruction:
{instruction}

Code:
{code}
""".strip()

        try:
            raw = self._generate(
                prompt=prompt,
                temperature=0.2,
                max_tokens=self._stage_max_tokens("repair"),
            )
            return self._extract_code(raw)
        except Exception:
            return code
