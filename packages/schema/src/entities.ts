/**
 * Core geometric and domain entity types shared across the entire TopView
 * SVG Mapper monorepo. Every other `@topview/*` package (and the Python
 * `reconstruction_api` service, by hand-mirroring) treats this file's shapes
 * as the one vocabulary for "what a detected/edited floor-plan object is".
 *
 * See docs/architecture.md §3 for why `@topview/schema` has zero internal
 * dependencies: everything downstream needs to trust this vocabulary never
 * imports anything back, keeping the dependency graph a DAG.
 */

/** Stable identifier for any entity within a project. Opaque string, not a URL/URI. */
export type EntityId = string;

/** ISO-8601 timestamp string, e.g. `"2026-07-06T12:00:00.000Z"`. */
export type IsoTimestamp = string;

export interface Point2D {
  x: number;
  y: number;
}

export interface Point3D {
  x: number;
  y: number;
  z: number;
}

export interface BoundingBox3D {
  min: Point3D;
  max: Point3D;
}

export interface BoundingBox2D {
  min: Point2D;
  max: Point2D;
}

/** Where an entity (or its confidence assessment) originated from. */
export type ProvenanceSource = 'detector' | 'user' | 'imported';

/**
 * Human-review state attached to every entity. The SVG editor
 * (`apps/web/src/svg-editor/`) models accepting/rejecting a detection as an
 * `EditorCommand` mutating `validationStatus` — exactly as undoable as
 * dragging a vertex (see docs/architecture.md §9).
 */
export type ValidationStatus =
  | 'unreviewed'
  | 'user-accepted'
  | 'user-rejected'
  | 'user-edited';

/**
 * Confidence/provenance metadata carried by every entity. Named
 * `ConfidenceMeta` (not flattened onto the entity) so it can be replaced as
 * a unit by a single `EditorCommand` (e.g. `SetConfidenceValidationCommand`)
 * without touching the entity's geometry fields.
 */
export interface ConfidenceMeta {
  /** Detector-reported confidence in [0, 1]. 1 for wholly user-authored geometry. */
  score: number;
  source: ProvenanceSource;
  /** `manifestId` of the plugin that produced this entity, when `source === 'detector'`. */
  sourcePluginId?: string;
  validationStatus: ValidationStatus;
  reviewedAt?: IsoTimestamp;
  reviewedBy?: string;
}

/** Confidence metadata for a brand-new, wholly user-authored entity. */
export function createDefaultConfidenceMeta(
  overrides: Partial<ConfidenceMeta> = {},
): ConfidenceMeta {
  return {
    score: 1,
    source: 'user',
    validationStatus: 'user-accepted',
    ...overrides,
  };
}

export type EntityKind = 'wall' | 'corner' | 'door' | 'window' | 'room' | 'furniture';

/** Fields shared by every concrete entity kind. */
export interface BaseEntity {
  id: EntityId;
  kind: EntityKind;
  /** `Layer.id` (or `ProjectLayer.id`, see project-format.ts) this entity is drawn on. */
  layerId: string;
  confidence: ConfidenceMeta;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface Wall extends BaseEntity {
  kind: 'wall';
  start: Point2D;
  end: Point2D;
  thicknessM: number;
  heightM?: number;
  /** `Corner.id` at each endpoint, once corner-detection/merging has run. */
  startCornerId?: EntityId;
  endCornerId?: EntityId;
}

export interface Corner extends BaseEntity {
  kind: 'corner';
  position: Point2D;
  connectedWallIds: EntityId[];
}

export type SwingDirection = 'left' | 'right' | 'sliding' | 'none';

export interface Door extends BaseEntity {
  kind: 'door';
  /** Host wall, or `null` for a freestanding/unattached door (e.g. mid-import). */
  wallId: EntityId | null;
  /** Distance in meters along the host wall from `wall.start` to the door's center. */
  positionOnWallM: number;
  widthM: number;
  swingDirection: SwingDirection;
  /** Rotation in degrees, relative to the host wall's normal. */
  rotationDeg: number;
}

export interface Window extends BaseEntity {
  kind: 'window';
  wallId: EntityId | null;
  positionOnWallM: number;
  widthM: number;
  heightM?: number;
  sillHeightM?: number;
  rotationDeg: number;
}

export interface Room extends BaseEntity {
  kind: 'room';
  /** Closed polygon boundary in project (meters) coordinates; first point not repeated at the end. */
  boundary: Point2D[];
  wallIds: EntityId[];
  label?: string;
  areaSqM?: number;
}

export type FurnitureCategory =
  | 'sofa'
  | 'table'
  | 'chair'
  | 'bed'
  | 'cabinet'
  | 'appliance'
  | 'other';

export interface Furniture extends BaseEntity {
  kind: 'furniture';
  category: FurnitureCategory;
  position: Point2D;
  rotationDeg: number;
  /** Footprint polygon in absolute project coordinates. */
  footprint: Point2D[];
  label?: string;
}

/**
 * Discriminated union of every floor-plan entity kind the editor and
 * pipeline know about. This is the `Record<EntityId, AnyEntity>` shape used
 * by `EditorSceneState` (`apps/web/src/svg-editor/types.ts`) and by
 * `ProjectDocument.entities` (see project-format.ts).
 */
export type AnyEntity = Wall | Corner | Door | Window | Room | Furniture;

/**
 * What a `FeatureDetector` plugin (`@topview/plugin-sdk`) hands back from
 * `detect()`. Structurally identical to `AnyEntity` today — every entity
 * already carries a `confidence`/`validationStatus` pair via
 * `ConfidenceMeta` — kept as a distinct alias so detector-facing code
 * (plugin-sdk, pipeline-core) can evolve independently of the
 * editor-facing `AnyEntity` name without a breaking rename. See
 * docs/api.md §1/§2.
 */
export type DetectedEntity = AnyEntity;

export interface CameraIntrinsics {
  focalLengthPx: [number, number];
  principalPointPx: [number, number];
  imageWidthPx: number;
  imageHeightPx: number;
  /** Radial/tangential distortion coefficients, solver-dependent length/order. */
  distortion?: number[];
}

/** Estimated pose of one video frame's camera, produced by camera-reconstruction (SfM). */
export interface CameraPose {
  frameId: string;
  /** Camera center in the reconstruction's local world frame, in meters. */
  position: Point3D;
  /** Orientation quaternion, `[x, y, z, w]`. */
  rotationQuaternion: [number, number, number, number];
  intrinsics?: CameraIntrinsics;
  confidence?: ConfidenceMeta;
}

export interface PointCloudPoint {
  position: Point3D;
  color?: [number, number, number];
  normal?: Point3D;
}

/**
 * Point clouds can be small enough to inline in a `ProjectDocument` or large
 * enough that they must live in external blob/backend storage (see
 * docs/performance.md for the tradeoff). Both are modeled explicitly as a
 * discriminated union so consumers cannot forget to handle the external
 * case.
 */
export type PointCloudStorage =
  | { mode: 'inline'; points: PointCloudPoint[] }
  | { mode: 'external'; uri: string; format: 'ply' | 'las' | 'pcd'; pointCount: number };

export interface PointCloud {
  id: EntityId;
  /** Pipeline run that produced this point cloud. */
  runId: string;
  storage: PointCloudStorage;
  boundingBox?: BoundingBox3D;
  createdAt: IsoTimestamp;
}
