import logging
import json
import re
from typing import Any

import httpx

from app.core.config import get_settings
from app.schemas.generate import GenerateRequest
from app.services.prompt_builder import build_generation_prompt

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

    def _generate(self, prompt: str, temperature: float | None = None) -> str:
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
            "max_tokens": self.settings.llm_max_tokens,
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
            }

    def _generate_structured(
        self, payload: GenerateRequest
    ) -> tuple[str, list[str], str, dict[str, Any]]:
        attempts: list[dict[str, Any]] = []
        warnings: list[str] = []
        storyboard: list[str] = []
        scene_plan: dict[str, Any] = {}

        try:
            storyboard_prompt = f"""
Create a concise storyboard for a Manim educational animation.
Return JSON only as an array of 4 to 7 strings. Each string is one visual beat.

Topic: {payload.topic}
Audience level: {payload.level}
Duration seconds: {payload.duration_seconds}
Style: {payload.style}
Additional instructions: {payload.additional_instructions}
""".strip()
            raw_storyboard = self._generate(storyboard_prompt, temperature=0.2)
            parsed_storyboard = self._extract_json(raw_storyboard)
            if not isinstance(parsed_storyboard, list):
                raise ValueError("Storyboard was not a JSON array")
            storyboard = [str(item) for item in parsed_storyboard][:7]
            attempts.append({"phase": "storyboard", "source": "llm", "ok": True})

            plan_prompt = f"""
Create a Manim scene plan from this storyboard.
Return JSON only with keys: objects, timings, transitions, labels, formulas, risks.
Prefer Text for prose labels and MathTex only for formulas.
Avoid Tex entirely.

Storyboard:
{json.dumps(storyboard, indent=2)}
""".strip()
            raw_plan = self._generate(plan_prompt, temperature=0.2)
            parsed_plan = self._extract_json(raw_plan)
            if not isinstance(parsed_plan, dict):
                raise ValueError("Scene plan was not a JSON object")
            scene_plan = parsed_plan
            attempts.append({"phase": "scene_plan", "source": "llm", "ok": True})

            code_prompt = f"""
Generate complete Manim CE Python code from this scene plan.
Constraints:
- Return code only.
- Use `from manim import *`.
- Define exactly `class GeneratedScene(Scene):`.
- Use valid Manim APIs only.
- Use Text for prose and labels. Use MathTex only for formulas. Never use Tex.
- Keep total runtime near {payload.duration_seconds} seconds.
- Keep object counts modest and animations clear.

Original topic: {payload.topic}
Scene plan JSON:
{json.dumps(scene_plan, indent=2)}
""".strip()
            raw_code = self._generate(code_prompt, temperature=0.15)
            code = self._extract_code(raw_code)
            attempts.append({"phase": "code", "source": "llm", "ok": True})
            return code, warnings, "llm", {
                "pipeline_mode": "structured",
                "storyboard": storyboard,
                "scene_plan": scene_plan,
                "generation_attempts": attempts,
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
                    "scene_plan": scene_plan or None,
                    "generation_attempts": attempts + metadata.get("generation_attempts", []),
                }
            )
            return code, warnings, source, metadata

    def fix_code(self, code: str, error: str) -> str:
        prompt = f"""
Fix the following Manim script.
Constraints:
- Keep `GeneratedScene(Scene)` and `construct(self)`.
- Use only `from manim import *`.
- No unsafe imports or system/file/network calls.
- Return code only.
- Do not call undefined/private methods on `self` (for example `_set_background`, `_add_area`).
- Do not invent methods like `play_and_wait`; use valid Scene APIs such as `play(...)` and `wait(...)`.
- Do not use `Tex(...)`. Use `Text(...)` for prose/labels and `MathTex(...)` only for formulas.
- If a LaTeX error mentions underscores, carets, or failed dvi conversion, replace bad `Tex(...)` labels with `Text(...)` or valid `MathTex(...)`.
- If you need helper methods, define them explicitly in `GeneratedScene`.
- Ensure final code can render directly with `manim ... GeneratedScene`.

Runtime error:
{error}

Code:
{code}
""".strip()

        try:
            raw = self._generate(prompt=prompt, temperature=0.1)
            return self._extract_code(raw)
        except Exception:
            return code

    def regenerate_with_instruction(self, code: str, instruction: str) -> str:
        prompt = f"""
Revise this Manim script based on the instruction.
Constraints:
- Keep `GeneratedScene(Scene)` and `construct(self)`.
- Use only `from manim import *`.
- No unsafe imports or system/file/network calls.
- Return code only.
- Do not use `Tex(...)`. Use `Text(...)` for prose/labels and `MathTex(...)` only for formulas.

Instruction:
{instruction}

Code:
{code}
""".strip()

        try:
            raw = self._generate(prompt=prompt, temperature=0.2)
            return self._extract_code(raw)
        except Exception:
            return code
