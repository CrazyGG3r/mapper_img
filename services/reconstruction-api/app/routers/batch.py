"""Batch orchestration: groups multiple heavy-compute jobs (sfm,
dense-reconstruction, ai-inference, ...) submitted together — e.g. "run the
whole reconstruction pipeline for this project overnight" — under a single
handle, rather than requiring apps/web to poll each stage job individually.

Real implementation is expected to fan out to the other routers' internal job
managers and aggregate their statuses. Stubbed here per docs/roadmap.md.
"""

from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..jobs import JobError, JobStatus, Priority

router = APIRouter(prefix="/batch", tags=["batch"])

# Mirrors the subset of PipelineStageId (from @topview/schema) that this
# service is actually responsible for executing — the compute-heavy stages.
# Lighter stages (upload, svg-cleanup, export, ...) are handled elsewhere and
# are intentionally excluded from what a batch here can request.
BatchStageId = Literal[
    "camera-reconstruction",
    "point-cloud-generation",
    "geometry-recovery",
    "wall-detection",
    "furniture-detection",
]


class BatchStageRequest(BaseModel):
    stage: BatchStageId
    plugin_id: str
    payload: dict = Field(description="Stage-specific request payload, validated by that stage's own router")


class BatchJobRequest(BaseModel):
    project_id: str
    run_id: str
    stages: list[BatchStageRequest] = Field(
        min_length=1, description="Ordered list of stage jobs to run as one batch"
    )
    priority: Priority = "batch"


class BatchJobHandle(BaseModel):
    batch_id: str
    job_ids: list[str] = Field(description="One underlying job id per requested stage, same order as `stages`")
    status: JobStatus = "queued"
    created_at: str = Field(description="ISO-8601 timestamp")


class BatchStageStatus(BaseModel):
    stage: BatchStageId
    job_id: str
    status: JobStatus
    error: Optional[JobError] = None


class BatchStatusResponse(BaseModel):
    batch_id: str
    status: JobStatus
    stages: list[BatchStageStatus]


class BatchCancelResponse(BaseModel):
    batch_id: str
    status: JobStatus


@router.post("/jobs", response_model=BatchJobHandle, status_code=501)
async def submit_batch_job(request: BatchJobRequest) -> BatchJobHandle:
    """Stub: submits a multi-stage batch job. Real implementation fans each
    entry in `stages` out to the matching router's job manager and tracks
    them under one `batch_id`. See docs/roadmap.md."""
    raise HTTPException(status_code=501, detail="batch job submission is not implemented — stage stub")


@router.get("/jobs/{batch_id}", response_model=BatchStatusResponse, status_code=501)
async def get_batch_job(batch_id: str) -> BatchStatusResponse:
    """Stub: fetches aggregate + per-stage status for a previously submitted
    batch. See docs/roadmap.md."""
    raise HTTPException(
        status_code=501, detail=f"batch job '{batch_id}' lookup is not implemented — stage stub"
    )


@router.delete("/jobs/{batch_id}", response_model=BatchCancelResponse, status_code=501)
async def cancel_batch_job(batch_id: str) -> BatchCancelResponse:
    """Stub: requests cancellation of every not-yet-completed stage job in a
    batch. See docs/roadmap.md."""
    raise HTTPException(
        status_code=501, detail=f"batch job '{batch_id}' cancellation is not implemented — stage stub"
    )
