from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_cache_service, get_llm_service
from app.schemas.generate import GenerateRequest, GenerateResponse
from app.services.cache_service import CacheService
from app.services.code_validator import CodeValidator
from app.services.llm_service import LLMService

router = APIRouter(tags=["generate"])
validator = CodeValidator()


@router.post("/generate", response_model=GenerateResponse)
def generate(
    payload: GenerateRequest,
    llm_service: LLMService = Depends(get_llm_service),
    cache_service: CacheService = Depends(get_cache_service),
):
    llm_cache_identity = (
        f"{llm_service.provider}:"
        f"{llm_service.model_name}:"
        f"{llm_service.settings.llm_base_url}:"
        f"{llm_service.settings.llm_max_tokens}:"
        f"{llm_service.settings.llm_system_prompt}:"
        f"{llm_service.settings.prompt_policy_version}:"
        f"{llm_service.settings.validator_policy_version}"
    )
    request_hash = cache_service.hash_text(
        f"gen:v5:{llm_cache_identity}:{payload.model_dump_json()}"
    )
    cached_code = cache_service.get_generation(request_hash)
    if cached_code:
        return GenerateResponse(
            code=cached_code,
            model=llm_service.model_name,
            source="cache",
            warnings=["Served from generation cache"],
        )

    try:
        code, warnings, source = llm_service.generate_code(payload)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM generation failed: {exc}") from exc

    validation = validator.validate(code)
    if not validation.ok:
        warnings.extend(validation.errors)
    elif not warnings:
        cache_service.set_generation(request_hash, code)

    return GenerateResponse(code=code, model=llm_service.model_name, source=source, warnings=warnings)
