import logging
import time
from pathlib import Path

from app.core.config import get_settings
from app.domain.enums import JobStatus
from app.services.cache_service import CacheService
from app.services.code_repairer import DeterministicCodeRepairer
from app.services.code_validator import CodeValidator
from app.services.error_classifier import classify_error
from app.services.job_service import JobService
from app.services.llm_service import LLMService
from app.services.render_orchestrator import RenderOrchestrator
from app.services.render_types import RenderTimeoutError
from app.services.storage_service import StorageService

logger = logging.getLogger(__name__)


def process_render_job(
    job_id: str,
    code: str,
    quality: str,
    retry_on_error: bool = True,
    render_hash: str | None = None,
) -> None:
    validator = CodeValidator()
    cache_service = CacheService()
    job_service = JobService()
    llm_service = LLMService()
    render_orchestrator = RenderOrchestrator()
    storage = StorageService()
    settings = get_settings()

    attempts = 1 + (settings.max_render_retries if retry_on_error else 0)
    current_code = code
    code_hash = cache_service.hash_text(code)
    repair_count = 0
    deterministic_repairer = DeterministicCodeRepairer()

    for attempt in range(1, attempts + 1):
        deterministic_code, deterministic_repairs = deterministic_repairer.repair(current_code)
        if deterministic_repairs:
            job_service.append_attempt(
                job_id,
                {
                    "attempt_number": attempt,
                    "phase": "deterministic_repair",
                    "error_type": "validation",
                    "error_summary": "; ".join(deterministic_repairs),
                    "input_code": current_code,
                    "output_code": deterministic_code,
                    "render_log_ref": None,
                    "deterministic_repairs": deterministic_repairs,
                },
            )
            current_code = deterministic_code
            repair_count += 1

        job_service.update_job(
            job_id,
            status=JobStatus.VALIDATING.value,
            stage="validating",
            progress=min(10 + (attempt - 1) * 10, 40),
            code_hash=code_hash,
        )
        validation = validator.validate(current_code)
        if not validation.ok:
            validation_error = f"Validation failed: {'; '.join(validation.errors)}"
            classified = classify_error(validation_error)
            if attempt < attempts:
                job_service.update_job(
                    job_id,
                    status=JobStatus.RETRYING.value,
                    stage="retrying_validation",
                    progress=min(20 + attempt * 15, 80),
                    error=validation_error,
                    error_type=classified.error_type,
                    error_summary=classified.summary,
                    repair_attempts=attempt,
                )
                fixed_code = llm_service.fix_code(current_code, validation_error)
                output_code = fixed_code if fixed_code.strip() else current_code
                job_service.append_attempt(
                    job_id,
                    {
                        "attempt_number": attempt,
                        "phase": "llm_validation_repair",
                        "error_type": classified.error_type,
                        "error_summary": classified.summary,
                        "input_code": current_code,
                        "output_code": output_code,
                        "render_log_ref": None,
                        "deterministic_repairs": [],
                    },
                )
                current_code = output_code
                repair_count += 1
                continue

            job_service.update_job(
                job_id,
                status=JobStatus.FAILED.value,
                stage="validation",
                progress=100,
                error=validation_error,
                error_type=classified.error_type,
                error_summary=classified.summary,
                final_code=current_code,
                repair_attempts=repair_count,
            )
            if render_hash:
                cache_service.clear_render_inflight(render_hash)
            return

        try:
            start_time = time.perf_counter()
            job_service.update_job(
                job_id,
                status=JobStatus.RENDERING.value,
                stage="rendering",
                progress=min(20 + (attempt - 1) * 20, 80),
                error=None,
                error_type=None,
                error_summary=None,
            )
            result = render_orchestrator.run(job_id=job_id, code=current_code, quality=quality)
            render_seconds = round(time.perf_counter() - start_time, 3)
            video_path = storage.put(job_id, result.video_file)
            thumbnail_path = storage.put_thumbnail(job_id, result.video_file)
            tmp_video = Path(result.video_file)
            file_size = tmp_video.stat().st_size if tmp_video.exists() else None
            if tmp_video.exists():
                tmp_video.unlink(missing_ok=True)
            artifact_metadata = {
                "quality": quality,
                "file_size_bytes": file_size,
                "render_seconds": render_seconds,
                "code_hash": cache_service.hash_text(current_code),
                "repaired": current_code != code,
                "manim_version": settings.manim_version,
                "renderer_image": settings.renderer_image,
                "renderer_policy_version": settings.renderer_policy_version,
                "thumbnail_generated": thumbnail_path is not None,
            }
            job_service.update_job(
                job_id,
                status=JobStatus.DONE.value,
                stage="done",
                progress=100,
                video_path=video_path,
                final_code=current_code,
                repair_attempts=repair_count,
                artifact_metadata=artifact_metadata,
                code_hash=artifact_metadata["code_hash"],
                thumbnail_url=f"/thumbnail/{job_id}" if thumbnail_path else None,
            )
            if render_hash:
                cache_service.set_render_artifact(render_hash, job_id)
                cache_service.clear_render_inflight(render_hash)
            return
        except RenderTimeoutError as exc:
            job_service.update_job(
                job_id,
                status=JobStatus.TIMEOUT.value,
                stage="timeout",
                progress=100,
                error=str(exc),
                error_type="timeout",
                error_summary=str(exc),
                final_code=current_code,
                repair_attempts=repair_count,
            )
            if render_hash:
                cache_service.clear_render_inflight(render_hash)
            return
        except Exception as exc:
            classified = classify_error(str(exc))
            if attempt < attempts:
                deterministic_code, deterministic_repairs = deterministic_repairer.repair(current_code, [str(exc)])
                if deterministic_repairs and deterministic_code != current_code:
                    output_code = deterministic_code
                    phase = "deterministic_runtime_repair"
                else:
                    fixed_code = llm_service.fix_code(current_code, str(exc))
                    output_code = fixed_code if fixed_code.strip() else current_code
                    phase = "llm_runtime_repair"
                job_service.update_job(
                    job_id,
                    status=JobStatus.RETRYING.value,
                    stage="retrying_runtime",
                    progress=min(40 + attempt * 20, 90),
                    error=str(exc),
                    error_type=classified.error_type,
                    error_summary=classified.summary,
                    repair_attempts=attempt,
                )
                job_service.append_attempt(
                    job_id,
                    {
                        "attempt_number": attempt,
                        "phase": phase,
                        "error_type": classified.error_type,
                        "error_summary": classified.summary,
                        "input_code": current_code,
                        "output_code": output_code,
                        "render_log_ref": None,
                        "deterministic_repairs": deterministic_repairs,
                    },
                )
                current_code = output_code
                repair_count += 1
                continue

            job_service.update_job(
                job_id,
                status=JobStatus.FAILED.value,
                stage="failed",
                progress=100,
                error=str(exc),
                error_type=classified.error_type,
                error_summary=classified.summary,
                final_code=current_code,
                repair_attempts=repair_count,
            )
            if render_hash:
                cache_service.clear_render_inflight(render_hash)
            return
