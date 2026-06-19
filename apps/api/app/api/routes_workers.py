from fastapi import APIRouter, Depends

from app.api.deps import get_authenticated_user, get_queue_service
from app.schemas.auth import AuthenticatedUser
from app.services.queue_service import QueueService
from app.services.render_orchestrator import RenderOrchestrator

router = APIRouter(tags=["workers"])


@router.get("/workers/health")
def workers_health(
    queue_service: QueueService = Depends(get_queue_service),
    _user: AuthenticatedUser = Depends(get_authenticated_user),
):
    renderer = RenderOrchestrator()
    try:
        renderer_health = renderer.health()
    except Exception as exc:
        renderer_health = {"ok": False, "error": str(exc)}
    return {
        **queue_service.worker_health(),
        "renderer": renderer_health,
    }
