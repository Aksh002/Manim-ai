from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_authenticated_user, get_request_llm_service
from app.schemas.auth import AuthenticatedUser
from app.schemas.render import RegenerateRequest, RegenerateResponse
from app.services.code_validator import CodeValidator
from app.services.llm_service import LLMService

router = APIRouter(tags=["regenerate"])
validator = CodeValidator()


@router.post("/regenerate", response_model=RegenerateResponse)
def regenerate(
    payload: RegenerateRequest,
    llm_service: LLMService = Depends(get_request_llm_service),
    _user: AuthenticatedUser = Depends(get_authenticated_user),
):
    try:
        code = llm_service.regenerate_with_instruction(payload.code, payload.instruction)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM regeneration failed: {exc}") from exc

    validation = validator.validate(code)
    if not validation.ok:
        raise HTTPException(status_code=400, detail={"errors": validation.errors})

    return RegenerateResponse(code=code)
