"""FastAPI app entrypoint for the reconstruction API stub.

Run locally (once Python is available — see README.md):
    uvicorn app.main:app --reload --port 8000

Or via Docker: see ../Dockerfile / ../docker-compose.yml.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import ai_inference, batch, dense_reconstruction, sfm


def create_app() -> FastAPI:
    app = FastAPI(
        title="TopView Reconstruction API",
        version="0.1.0",
        description=(
            "Heavy-compute backend for the TopView SVG mapper pipeline. "
            "Every route in this service is currently a stub returning 501 "
            "Not Implemented — see README.md and docs/roadmap.md."
        ),
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins_list,  # tighten in docs/deployment.md's production guidance
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/healthz")
    async def healthz() -> dict:
        return {"status": "ok"}

    app.include_router(sfm.router)
    app.include_router(dense_reconstruction.router)
    app.include_router(ai_inference.router)
    app.include_router(batch.router)

    return app


app = create_app()
