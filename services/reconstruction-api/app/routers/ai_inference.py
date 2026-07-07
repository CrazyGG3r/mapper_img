"""AI inference: runs learned models over frames/point-cloud data to detect
walls, doors, windows, rooms, and furniture as first-class entities.

Real implementation is expected to load a torch/onnxruntime model (see
requirements.txt's commented-out heavy deps) inside
app/core/inference (not yet scaffolded — Phase 2+, see docs/roadmap.md) and
run it over the requested input. Stubbed here for now.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..jobs import JobError, JobHandle, JobStatus, Priority
from ..models import AnyEntity, EntityType

router = APIRouter(prefix="/ai-inference", tags=["ai-inference"])


class AiInferenceRequest(BaseModel):
    project_id: str
    run_id: str
    model_id: str = Field(description="Registered inference model identifier, e.g. 'topview.wall-seg.v1'")
    target_entity_types: list[EntityType] = Field(
        min_length=1, description="Which entity types this call should attempt to detect"
    )
    input_refs: list[str] = Field(
        min_length=1, description="Frame ids/URIs and/or a point-cloud id to run inference over"
    )
    confidence_threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    priority: Priority = "batch"


class AiInferenceResult(BaseModel):
    entities: list[AnyEntity] = Field(
        description="Detected entities, each carrying its own ConfidenceMeta"
    )


class AiInferenceStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    error: Optional[JobError] = None
    result: Optional[AiInferenceResult] = Field(
        default=None, description="Populated only once status == 'succeeded'"
    )


@router.post("/jobs", response_model=JobHandle, status_code=501)
async def submit_ai_inference_job(request: AiInferenceRequest) -> JobHandle:
    """Stub: submits an AI-inference job (wall/door/window/room/furniture
    detection). Real implementation loads model_id via
    app/core/inference and reports progress via events.py-shaped events.
    See docs/roadmap.md."""
    raise HTTPException(
        status_code=501, detail="ai inference job submission is not implemented — stage stub"
    )


@router.get("/jobs/{job_id}", response_model=AiInferenceStatusResponse, status_code=501)
async def get_ai_inference_job(job_id: str) -> AiInferenceStatusResponse:
    """Stub: fetches status (and, once succeeded, detected entities) for a
    previously submitted job. See docs/roadmap.md."""
    raise HTTPException(
        status_code=501, detail=f"ai inference job '{job_id}' lookup is not implemented — stage stub"
    )
