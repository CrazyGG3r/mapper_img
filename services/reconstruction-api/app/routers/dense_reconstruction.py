"""Dense reconstruction: takes sparse SfM output (camera poses + sparse point
cloud) and densifies it into a full point cloud / mesh via multi-view stereo.

Real implementation is expected to wrap OpenMVS or Open3D's MVS helpers (see
requirements.txt's commented-out heavy deps). Stubbed here per
docs/roadmap.md.
"""

from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..jobs import JobError, JobHandle, JobStatus, Priority
from ..models import CameraPose, PointCloud

router = APIRouter(prefix="/dense-reconstruction", tags=["dense-reconstruction"])

Quality = Literal["draft", "standard", "high"]


class DenseReconstructionRequest(BaseModel):
    project_id: str
    run_id: str
    sparse_point_cloud_ref: str = Field(description="Id of a previously produced sparse PointCloud")
    camera_poses: list[CameraPose] = Field(min_length=1)
    quality: Quality = "standard"
    output_storage: Literal["inline", "external"] = Field(
        default="external",
        description="See docs/performance.md's inline-vs-external PointCloud storage tradeoffs",
    )
    priority: Priority = "batch"


class DenseReconstructionResult(BaseModel):
    point_cloud: PointCloud


class DenseReconstructionStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    error: Optional[JobError] = None
    result: Optional[DenseReconstructionResult] = Field(
        default=None, description="Populated only once status == 'succeeded'"
    )


@router.post("/jobs", response_model=JobHandle, status_code=501)
async def submit_dense_reconstruction_job(request: DenseReconstructionRequest) -> JobHandle:
    """Stub: submits a dense-reconstruction (MVS) job. Real implementation
    dispatches to OpenMVS/Open3D and reports progress via events.py-shaped
    events. See docs/roadmap.md."""
    raise HTTPException(
        status_code=501, detail="dense reconstruction job submission is not implemented — stage stub"
    )


@router.get("/jobs/{job_id}", response_model=DenseReconstructionStatusResponse, status_code=501)
async def get_dense_reconstruction_job(job_id: str) -> DenseReconstructionStatusResponse:
    """Stub: fetches status (and, once succeeded, the dense PointCloud) for a
    previously submitted job. See docs/roadmap.md."""
    raise HTTPException(
        status_code=501,
        detail=f"dense reconstruction job '{job_id}' lookup is not implemented — stage stub",
    )
