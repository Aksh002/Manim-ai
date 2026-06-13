import logging
from pathlib import Path

from app.core.config import get_settings
from app.domain.enums import JobStatus
from app.services.code_validator import CodeValidator
from app.services.cache_service import CacheService
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

    for attempt in range(1, attempts + 1):
        job_service.update_job(
            job_id,
            status=JobStatus.VALIDATING.value,
            stage="validating",
            progress=min(10 + (attempt - 1) * 10, 40),
        )
        validation = validator.validate(current_code)
        if not validation.ok:
            validation_error = f"Validation failed: {'; '.join(validation.errors)}"
            if attempt < attempts:
                job_service.update_job(
                    job_id,
                    status=JobStatus.RETRYING.value,
                    stage="retrying_validation",
                    progress=min(20 + attempt * 15, 80),
                    error=validation_error,
                    repair_attempts=attempt,
                )
                fixed_code = llm_service.fix_code(current_code, validation_error)
                current_code = fixed_code if fixed_code.strip() else current_code
                continue

            job_service.update_job(
                job_id,
                status=JobStatus.FAILED.value,
                stage="validation",
                progress=100,
                error=validation_error,
                final_code=current_code,
            )
            if render_hash:
                cache_service.clear_render_inflight(render_hash)
            return

        try:
            job_service.update_job(
                job_id,
                status=JobStatus.RENDERING.value,
                stage="rendering",
                progress=min(20 + (attempt - 1) * 20, 80),
                error=None,
            )
            result = render_orchestrator.run(job_id=job_id, code=current_code, quality=quality)
            video_path = storage.put(job_id, result.video_file)
            tmp_video = Path(result.video_file)
            if tmp_video.exists():
                tmp_video.unlink(missing_ok=True)
            job_service.update_job(
                job_id,
                status=JobStatus.DONE.value,
                stage="done",
                progress=100,
                video_path=video_path,
                final_code=current_code,
                repair_attempts=attempt - 1,
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
                final_code=current_code,
                repair_attempts=attempt - 1,
            )
            if render_hash:
                cache_service.clear_render_inflight(render_hash)
            return
        except Exception as exc:
            if attempt < attempts:
                job_service.update_job(
                    job_id,
                    status=JobStatus.RETRYING.value,
                    stage="retrying_runtime",
                    progress=min(40 + attempt * 20, 90),
                    error=str(exc),
                    repair_attempts=attempt,
                )
                current_code = llm_service.fix_code(current_code, str(exc))
                continue

            job_service.update_job(
                job_id,
                status=JobStatus.FAILED.value,
                stage="failed",
                progress=100,
                error=str(exc),
                final_code=current_code,
                repair_attempts=attempt - 1,
            )
            if render_hash:
                cache_service.clear_render_inflight(render_hash)
            return
