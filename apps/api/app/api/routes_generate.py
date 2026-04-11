

# routes_generate.py (line 1) hashes the request, checks generation cache, calls llm_service.py (line 1), then validates the returned code with code_validator.py (line 1). 

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
    request_hash = cache_service.hash_text(
        f"gen:v3:{llm_service.provider}:{llm_service.model_name}:{payload.model_dump_json()}"
    )
    cached_code = cache_service.get_generation(request_hash)
    if cached_code:
        return GenerateResponse(
            code=cached_code,
            model=llm_service.model_name,
            warnings=["Served from generation cache"],
        )

    try:
        code, warnings = llm_service.generate_code(payload)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM generation failed: {exc}") from exc

    validation = validator.validate(code)
    if not validation.ok:
        warnings.extend(validation.errors)
    elif not warnings:
        cache_service.set_generation(request_hash, code)

    return GenerateResponse(code=code, model=llm_service.model_name, warnings=warnings)
