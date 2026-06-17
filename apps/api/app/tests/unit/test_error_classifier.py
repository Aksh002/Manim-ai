from app.services.error_classifier import classify_error


def test_error_classifier_identifies_latex_and_sandbox_errors() -> None:
    assert classify_error("latex error converting to dvi").error_type == "latex"
    assert classify_error("Renderer preflight failed for manim-ai-renderer").error_type == "sandbox"


def test_error_classifier_identifies_validation_and_timeout_errors() -> None:
    assert classify_error("Validation failed: Missing GeneratedScene").error_type == "validation"
    assert classify_error("Sandbox render timed out").error_type == "timeout"
