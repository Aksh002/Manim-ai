#  wires FastAPI, CORS, request IDs, rate limiting, and all route modules together

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes_generate import router as generate_router
from app.api.routes_artifacts import router as artifacts_router
from app.api.routes_jobs import router as jobs_router
from app.api.routes_regenerate import router as regenerate_router
from app.api.routes_render import router as render_router
from app.api.routes_status import router as status_router
from app.api.routes_thumbnail import router as thumbnail_router
from app.api.routes_video import router as video_router
from app.api.routes_workers import router as workers_router
from app.core.config import get_settings
from app.core.logging import RequestIdMiddleware, configure_logging
from app.core.security import SimpleRateLimitMiddleware

settings = get_settings()
configure_logging()

app = FastAPI(title=settings.app_name, version="0.1.0")
app.add_middleware(RequestIdMiddleware)
app.add_middleware(SimpleRateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(generate_router)
app.include_router(regenerate_router)
app.include_router(render_router)
app.include_router(status_router)
app.include_router(artifacts_router)
app.include_router(jobs_router)
app.include_router(thumbnail_router)
app.include_router(video_router)
app.include_router(workers_router)
