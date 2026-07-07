"""Shared compute-job vocabulary used by every heavy-compute router.

Kept separate from models.py (which mirrors @topview/schema *entities*) since
job/status bookkeeping is this service's own concern, not something the
frontend schema package defines. Each router still declares its own
request/response models on top of `JobStatus`/`JobHandle` so each stage's
payload shape stays independently reviewable.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

JobStatus = Literal["queued", "running", "succeeded", "failed", "cancelled"]

Priority = Literal["interactive", "batch"]


class JobHandle(BaseModel):
    """Returned immediately on job submission. Mirrors the shape that
    apps/web's HttpComputeBackend / ComputeJobHandle contract expects
    (see packages/pipeline-core)."""

    job_id: str
    status: JobStatus = "queued"
    created_at: str = Field(description="ISO-8601 timestamp")


class JobError(BaseModel):
    code: str
    message: str
    recoverable: bool = False
