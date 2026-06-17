from __future__ import annotations

import ast
import re


class DeterministicCodeRepairer:
    def repair(self, code: str, errors: list[str] | None = None) -> tuple[str, list[str]]:
        repaired = code
        applied: list[str] = []

        next_code = self._replace_plain_tex_calls(repaired)
        if next_code != repaired:
            repaired = next_code
            applied.append("Replaced Tex(...) with Text(...) for plain labels/prose")

        next_code = self._cap_wait_calls(repaired)
        if next_code != repaired:
            repaired = next_code
            applied.append("Capped long wait(...) calls to 3 seconds")

        next_code = self._cap_run_time_keywords(repaired)
        if next_code != repaired:
            repaired = next_code
            applied.append("Capped long run_time values to 4 seconds")

        return repaired, applied

    def _replace_plain_tex_calls(self, code: str) -> str:
        try:
            tree = ast.parse(code)
        except SyntaxError:
            return code

        replacements: list[tuple[int, int, str]] = []
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            if not isinstance(node.func, ast.Name) or node.func.id != "Tex":
                continue
            if not node.args or not isinstance(node.args[0], ast.Constant):
                continue
            value = node.args[0].value
            if not isinstance(value, str):
                continue
            replacement = "MathTex" if self._looks_like_formula(value) else "Text"
            replacements.append((node.func.lineno, node.func.col_offset, replacement))

        if not replacements:
            return code

        lines = code.splitlines(keepends=True)
        for lineno, col, replacement in sorted(replacements, reverse=True):
            index = lineno - 1
            lines[index] = f"{lines[index][:col]}{replacement}{lines[index][col + 3:]}"
        return "".join(lines)

    def _looks_like_formula(self, value: str) -> bool:
        math_markers = ("=", "\\", "^", "_", "+", "-", "\\frac", "\\sum", "\\int")
        return any(marker in value for marker in math_markers)

    def _cap_wait_calls(self, code: str) -> str:
        return re.sub(r"\.wait\((\d+(?:\.\d+)?)\)", self._cap_wait_match, code)

    def _cap_wait_match(self, match: re.Match[str]) -> str:
        value = float(match.group(1))
        return ".wait(3)" if value > 3 else match.group(0)

    def _cap_run_time_keywords(self, code: str) -> str:
        return re.sub(r"run_time\s*=\s*(\d+(?:\.\d+)?)", self._cap_run_time_match, code)

    def _cap_run_time_match(self, match: re.Match[str]) -> str:
        value = float(match.group(1))
        return "run_time=4" if value > 4 else match.group(0)
