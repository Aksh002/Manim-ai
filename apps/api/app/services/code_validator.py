import ast
from dataclasses import dataclass, field

FORBIDDEN_IMPORTS = {
    "builtins",
    "os",
    "sys",
    "subprocess",
    "socket",
    "pathlib",
    "shutil",
    "requests",
    "httpx",
    "urllib",
}

FORBIDDEN_CALLS = {
    "__import__",
    "compile",
    "delattr",
    "eval",
    "exec",
    "getattr",
    "globals",
    "hasattr",
    "input",
    "locals",
    "open",
    "setattr",
    "vars",
}
KNOWN_SCENE_METHODS = {
    "add",
    "remove",
    "clear",
    "play",
    "wait",
    "next_section",
    "add_sound",
    "add_foreground_mobject",
    "remove_foreground_mobject",
    "bring_to_front",
    "bring_to_back",
    "add_fixed_in_frame_mobjects",
    "remove_fixed_in_frame_mobjects",
    "add_fixed_orientation_mobjects",
}


@dataclass
class ValidationResult:
    ok: bool
    errors: list[str] = field(default_factory=list)


class CodeValidator:
    """Checks the generated script contract before sandboxed rendering."""

    def validate(self, code: str) -> ValidationResult:
        errors: list[str] = []
        seen_errors: set[str] = set()

        def add_error(message: str) -> None:
            if message not in seen_errors:
                seen_errors.add(message)
                errors.append(message)

        if len(code.encode("utf-8")) > 100_000:
            errors.append("Code exceeds max size 100KB")

        try:
            tree = ast.parse(code)
        except SyntaxError as exc:
            return ValidationResult(ok=False, errors=[f"Syntax error: {exc.msg} at line {exc.lineno}"])

        has_required_import = False
        has_scene = False
        has_construct = False

        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                if node.module == "manim":
                    has_required_import = True
                elif node.module and node.module.split(".")[0] in FORBIDDEN_IMPORTS:
                    add_error(f"Forbidden import from: {node.module}")

            if isinstance(node, ast.Import):
                for alias in node.names:
                    root = alias.name.split(".")[0]
                    if root in FORBIDDEN_IMPORTS:
                        add_error(f"Forbidden import: {alias.name}")

            if isinstance(node, ast.Call):
                fn_name = None
                if isinstance(node.func, ast.Name):
                    fn_name = node.func.id
                elif isinstance(node.func, ast.Attribute):
                    fn_name = node.func.attr
                if fn_name in FORBIDDEN_CALLS:
                    add_error(f"Forbidden call: {fn_name}")
                if fn_name == "Tex":
                    line = getattr(node, "lineno", "?")
                    add_error(
                        f"Unsupported Tex call at line {line}: use Text(...) for prose/labels "
                        "or MathTex(...) for mathematical formulas."
                    )

            if isinstance(node, ast.Attribute) and node.attr.startswith("__"):
                line = getattr(node, "lineno", "?")
                add_error(f"Forbidden dunder attribute access at line {line}: {node.attr}")

            if isinstance(node, ast.Name) and node.id.startswith("__"):
                line = getattr(node, "lineno", "?")
                add_error(f"Forbidden dunder name at line {line}: {node.id}")

            if isinstance(node, ast.ClassDef) and node.name == "GeneratedScene":
                for base in node.bases:
                    if isinstance(base, ast.Name) and base.id == "Scene":
                        has_scene = True

                defined_methods = {
                    child.name for child in node.body if isinstance(child, ast.FunctionDef)
                }
                for child in node.body:
                    if isinstance(child, ast.FunctionDef) and child.name == "construct":
                        has_construct = True

                for class_node in ast.walk(node):
                    if not isinstance(class_node, ast.Call):
                        continue
                    if not isinstance(class_node.func, ast.Attribute):
                        continue
                    if not isinstance(class_node.func.value, ast.Name):
                        continue
                    if class_node.func.value.id != "self":
                        continue

                    method_name = class_node.func.attr
                    if method_name in defined_methods:
                        continue
                    if method_name in KNOWN_SCENE_METHODS:
                        continue

                    line = getattr(class_node, "lineno", "?")
                    if method_name.startswith("_"):
                        add_error(
                            f"Undefined private method on self at line {line}: self.{method_name}(...). "
                            "Do not invent private Scene helpers unless defined in class."
                        )
                    else:
                        add_error(
                            f"Unknown Scene method at line {line}: self.{method_name}(...). "
                            "Use valid Manim Scene APIs or define the helper method in class."
                        )

        if not has_required_import:
            add_error("Missing required import: from manim import *")
        if not has_scene:
            add_error("Missing required class: GeneratedScene(Scene)")
        if not has_construct:
            add_error("Missing required method: construct(self)")

        return ValidationResult(ok=not errors, errors=errors)
