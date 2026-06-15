import logging
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
    def __init__(self) -> None:
        self.settings = get_settings()
        self.client = httpx.Client(timeout=self.settings.llm_request_timeout_sec)

    @property
    def provider(self) -> str:
        return "openai_compatible"

    @property
    def model_name(self) -> str:
        return self.settings.llm_model

    def _chat_completions_url(self) -> str:
        base_url = self.settings.llm_base_url.strip().rstrip("/")
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
        if not self.settings.llm_api_key:
            raise RuntimeError("LLM_API_KEY is not configured")
        if not self.settings.llm_model:
            raise RuntimeError("LLM_MODEL is not configured")

        payload: dict[str, Any] = {
            "model": self.settings.llm_model,
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
                "Authorization": f"Bearer {self.settings.llm_api_key}",
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
        prompt = build_generation_prompt(payload)
        try:
            raw = self._generate(prompt=prompt, temperature=0.2)
            return self._extract_code(raw), [], "llm"
        except Exception as exc:
            if not self.settings.allow_llm_fallback:
                raise
            logger.warning("Primary LLM generation failed, using fallback template: %s", exc)
            message = str(exc).strip()
            if len(message) > 260:
                message = f"{message[:260]}..."
            return self._fallback_code(payload.topic), [
                f"LLM unavailable ({self.provider}): {message}. Using fallback template"
            ], "fallback"

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
