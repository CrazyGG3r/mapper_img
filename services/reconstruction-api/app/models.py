"""Pydantic mirror of @topview/schema's core entity shapes.

CONTRACT-SYNC NOTE (unverified — read before trusting this file):
`packages/schema` (the TypeScript source of truth for `Wall` / `Door` /
`Window` / `Room` / `Furniture` / `CameraPose` / `PointCloud` /
`ConfidenceMeta` and friends) is scaffolded by a different agent in this same
monorepo pass, in parallel with this service. At the time this file was
written there was no `packages/schema` output on disk yet to diff against, so
the field shapes below are this agent's best-effort, docs-consistent
reconstruction of what the blueprint describes (entity ids, confidence
metadata, per-entity-type geometry, validation status, etc.) rather than a
generated-from-source mirror.

Per docs/architecture.md's stated contract-sync strategy (§9 of the
blueprint), this drift is expected to be caught, not silently shipped: a CI
step is meant to load `packages/schema/dist/schema/*.json` and validate
fixture payloads produced by these Python models against it via the
`jsonschema` package. Until that CI step exists and has run at least once,
treat every field name/type here as a *proposal* to reconcile against the
real `@topview/schema` package, not an already-verified mirror.

Everything below is otherwise fully-typed, real Pydantic v2 — no field is a
placeholder.
"""

from __future__ import annotations

from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Shared primitives
# ---------------------------------------------------------------------------

EntityId = str
ValidationStatus = Literal["unreviewed", "user-accepted", "user-rejected", "user-edited"]
EntityType = Literal["wall", "door", "window", "room", "furniture"]


class Point2D(BaseModel):
    x: float
    y: float


class Point3D(BaseModel):
    x: float
    y: float
    z: float


class BoundingBox3D(BaseModel):
    min: Point3D
    max: Point3D


class ConfidenceMeta(BaseModel):
    """Mirrors @topview/schema's ConfidenceMeta: how much to trust a detected
    entity, and whether/how a human has since reviewed it."""

    score: float = Field(ge=0.0, le=1.0)
    source: str = Field(description="Producing plugin's manifestId, or 'user' for hand-authored entities")
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[str] = Field(default=None, description="ISO-8601 timestamp")


# ---------------------------------------------------------------------------
# Entities (mirrors @topview/schema's AnyEntity union)
# ---------------------------------------------------------------------------


class EntityBase(BaseModel):
    id: EntityId
    layer_id: Optional[str] = None
    confidence: ConfidenceMeta
    validation_status: ValidationStatus = "unreviewed"


class Wall(EntityBase):
    type: Literal["wall"] = "wall"
    start: Point2D
    end: Point2D
    thickness_m: float = Field(gt=0)
    height_m: Optional[float] = Field(default=None, gt=0)


class Door(EntityBase):
    type: Literal["door"] = "door"
    wall_id: EntityId
    offset_m: float = Field(description="Distance from the host wall's start point, in meters")
    width_m: float = Field(gt=0)
    swing_direction: Optional[Literal["left", "right", "sliding", "none"]] = None


class Window(EntityBase):
    type: Literal["window"] = "window"
    wall_id: EntityId
    offset_m: float = Field(description="Distance from the host wall's start point, in meters")
    width_m: float = Field(gt=0)
    sill_height_m: Optional[float] = None


class Room(EntityBase):
    type: Literal["room"] = "room"
    name: Optional[str] = None
    boundary: list[Point2D] = Field(min_length=3)
    wall_ids: list[EntityId] = Field(default_factory=list)
    area_sq_m: Optional[float] = Field(default=None, ge=0)
    floor_level: int = 0


class Furniture(EntityBase):
    type: Literal["furniture"] = "furniture"
    category: str = Field(description="e.g. 'sofa', 'table', 'bed' — open vocabulary, plugin-defined")
    footprint: list[Point2D] = Field(min_length=3)
    position: Point2D
    rotation_deg: float = 0.0
    height_m: Optional[float] = None


AnyEntity = Annotated[
    Union[Wall, Door, Window, Room, Furniture],
    Field(discriminator="type"),
]


# ---------------------------------------------------------------------------
# Reconstruction primitives
# ---------------------------------------------------------------------------


class CameraPose(BaseModel):
    """One recovered camera position/orientation for a single input frame."""

    frame_id: str
    position: Point3D
    rotation_quaternion: tuple[float, float, float, float] = Field(
        description="(x, y, z, w) unit quaternion"
    )
    intrinsics_id: Optional[str] = Field(
        default=None, description="Reference to a shared camera-intrinsics record, if known"
    )
    reprojection_error: Optional[float] = Field(default=None, ge=0)


class PointXYZRGB(BaseModel):
    x: float
    y: float
    z: float
    r: Optional[int] = Field(default=None, ge=0, le=255)
    g: Optional[int] = Field(default=None, ge=0, le=255)
    b: Optional[int] = Field(default=None, ge=0, le=255)


class PointCloud(BaseModel):
    """Mirrors @topview/schema's PointCloud, including the inline-vs-external
    storage tradeoff documented in docs/performance.md."""

    id: str
    storage: Literal["inline", "external"]
    count: int = Field(ge=0)
    points: Optional[list[PointXYZRGB]] = Field(
        default=None, description="Present only when storage == 'inline'"
    )
    uri: Optional[str] = Field(
        default=None, description="Present only when storage == 'external' (e.g. object storage key)"
    )
    bounding_box: Optional[BoundingBox3D] = None
