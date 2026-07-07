"""Structure-from-Motion: recovers camera poses (and a sparse point cloud)
from an ordered/unordered set of video frames.

Real implementation is expected to wrap pycolmap (see requirements.txt's
commented-out heavy deps) or shell out to a COLMAP binary. Stubbed here per
docs/roadmap.md.
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..jobs import JobError, JobHandle, JobStatus, Priority
from ..models import CameraPose, PointCloud

router = APIRouter(prefix="/sfm", tags=["sfm"])


class CameraIntrinsicsHint(BaseModel):
    """Optional prior knowledge to seed/constrain SfM, e.g. from EXIF or a
    known device's calibration profile."""

    focal_length_px: Optional[float] = Field(default=None, gt=0)
    principal_point_px: Optional[tuple[float, float]] = None
    image_width_px: Optional[int] = Field(default=None, gt=0)
    image_height_px: Optional[int] = Field(default=None, gt=0)


class SfmJobRequest(BaseModel):
    project_id: str
    run_id: str
    frame_refs: list[str] = Field(
        min_length=2, description="Ordered or unordered frame ids/URIs to reconstruct from"
    )
    feature_detector_plugin_id: Optional[str] = Field(
        default=None, description="e.g. 'topview.detector.example-wall-heuristic'-style manifestId"
    )
    camera_intrinsics_hint: Optional[CameraIntrinsicsHint] = None
    priority: Priority = "batch"


class SfmResult(BaseModel):
    camera_poses: list[CameraPose]
    sparse_point_cloud: PointCloud


class SfmJobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    error: Optional[JobError] = None
    result: Optional[SfmResult] = Field(
        default=None, description="Populated only once status == 'succeeded'"
    )


@router.post("/jobs", response_model=JobHandle, status_code=501)
async def submit_sfm_job(request: SfmJobRequest) -> JobHandle:
    """Stub: submits a structure-from-motion job.

    Mirrors ComputeJobRequest from @topview/pipeline-core. Real implementation
    dispatches frame_refs to pycolmap/COLMAP, recovers CameraPose entries plus
    a sparse PointCloud, and reports progress via events.py-shaped events.
    See docs/roadmap.md.
    """
    raise HTTPException(status_code=501, detail="sfm job submission is not implemented — stage stub")


@router.get("/jobs/{job_id}", response_model=SfmJobStatusResponse, status_code=501)
async def get_sfm_job(job_id: str) -> SfmJobStatusResponse:
    """Stub: fetches status (and, once succeeded, the SfmResult) for a
    previously submitted job. See docs/roadmap.md."""
    raise HTTPException(status_code=501, detail=f"sfm job '{job_id}' lookup is not implemented — stage stub")
