from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import app
from app.api.deps import get_authenticated_user


def test_internal_token_required_when_owner_fallback_disabled() -> None:
    settings = get_settings()
    original_token = settings.internal_api_token
    original_fallback = settings.allow_owner_token_fallback
    settings.internal_api_token = "test-internal-token"
    settings.allow_owner_token_fallback = False

    try:
        client = TestClient(app)
        assert client.get("/workers/health").status_code == 401
        response = client.get(
            "/workers/health",
            headers={
                "x-manim-internal-token": "test-internal-token",
                "x-manim-user-id": "user_test",
                "x-manim-user-email": "user@example.com",
            },
        )
        assert response.status_code == 200
    finally:
        settings.internal_api_token = original_token
        settings.allow_owner_token_fallback = original_fallback


def test_local_dev_proxy_user_header_is_accepted_without_internal_token() -> None:
    settings = get_settings()
    original_token = settings.internal_api_token
    original_fallback = settings.allow_owner_token_fallback
    settings.internal_api_token = ""
    settings.allow_owner_token_fallback = True

    try:
        user = get_authenticated_user(
            x_manim_internal_token=None,
            x_manim_user_id="dev-user",
            x_manim_user_email="dev@manim-ai.local",
        )
        assert user.user_id == "dev-user"
        assert user.is_internal is True
    finally:
        settings.internal_api_token = original_token
        settings.allow_owner_token_fallback = original_fallback
