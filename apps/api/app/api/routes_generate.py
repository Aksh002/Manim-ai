import json

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import get_authenticated_user, get_cache_service, get_request_llm_service
from app.schemas.auth import AuthenticatedUser
from app.schemas.generate import GenerateRequest, GenerateResponse
from app.services.cache_service import CacheService
from app.services.code_validator import CodeValidator
from app.services.llm_service import LLMService

router = APIRouter(tags=["generate"])
validator = CodeValidator()


@router.post("/generate", response_model=GenerateResponse)
def generate(
    payload: GenerateRequest,
    llm_service: LLMService = Depends(get_request_llm_service),
    cache_service: CacheService = Depends(get_cache_service),
    _user: AuthenticatedUser = Depends(get_authenticated_user),
):
    skill_summary = llm_service.skill_registry.provenance_summary()
    llm_cache_identity = (
        f"{llm_service.provider}:"
        f"{llm_service.model_name}:"
        f"{llm_service.base_url}:"
        f"{llm_service.settings.llm_max_tokens}:"
        f"{getattr(llm_service.settings, 'llm_storyboard_max_tokens', '')}:"
        f"{getattr(llm_service.settings, 'llm_scene_plan_max_tokens', '')}:"
        f"{getattr(llm_service.settings, 'llm_code_max_tokens', '')}:"
        f"{llm_service.settings.llm_system_prompt}:"
        f"{llm_service.settings.prompt_policy_version}:"
        f"{llm_service.settings.validator_policy_version}:"
        f"{getattr(llm_service.settings, 'skill_policy_version', '')}:"
        f"{skill_summary.get('policy_hash')}:"
        f"{getattr(llm_service.settings, 'manim_version', '')}:"
        f"{llm_service.settings.generation_pipeline_mode}"
    )
    request_hash = cache_service.hash_text(
        f"gen:v6:{llm_cache_identity}:{payload.model_dump_json()}"
    )
    cached_payload = cache_service.get_generation_payload(request_hash)
    if cached_payload:
        try:
            body = json.loads(cached_payload)
            body["source"] = "cache"
            body["warnings"] = ["Served from generation cache"]
            return GenerateResponse(**body)
        except Exception:
            pass

    cached_code = cache_service.get_generation(request_hash)
    if cached_code:
        return GenerateResponse(
            code=cached_code,
            model=llm_service.model_name,
            source="cache",
            warnings=["Served from generation cache"],
            pipeline_mode=llm_service.settings.generation_pipeline_mode,
            manim_version=getattr(llm_service.settings, "manim_version", None),
        )

    try:
        code, warnings, source, metadata = llm_service.generate_code_with_metadata(payload)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM generation failed: {exc}") from exc

    validation = validator.validate(code)
    if not validation.ok:
        warnings.extend(validation.errors)

    response = GenerateResponse(
        code=code,
        model=llm_service.model_name,
        source=source,
        warnings=warnings,
        storyboard=metadata.get("storyboard"),
        storyboard_document=metadata.get("storyboard_document"),
        scene_plan=metadata.get("scene_plan"),
        planning_report=metadata.get("planning_report"),
        skill_provenance=metadata.get("skill_provenance"),
        manim_version=metadata.get("manim_version", getattr(llm_service.settings, "manim_version", None)),
        generation_attempts=metadata.get("generation_attempts", []),
        quality_report=metadata.get("quality_report"),
        pipeline_mode=metadata.get("pipeline_mode", llm_service.settings.generation_pipeline_mode),
    )
    if validation.ok and not warnings:
        cache_service.set_generation_payload(request_hash, response.model_dump_json())
        cache_service.set_generation(request_hash, code)

    return response
