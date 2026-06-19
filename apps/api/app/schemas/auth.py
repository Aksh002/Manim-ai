from pydantic import BaseModel


class AuthenticatedUser(BaseModel):
    user_id: str | None = None
    email: str | None = None
    is_internal: bool = False
    allow_owner_token_fallback: bool = True
