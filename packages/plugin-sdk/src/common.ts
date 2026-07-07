/**
 * Foundational types shared by every plugin kind in this SDK.
 *
 * This is the *only* module in the package that imports from `@topview/schema`
 * directly (type-only, fully erased at build time) -- every other module in
 * this package re-imports `EntityId` / `PipelineStageId` from here. Keeping
 * the cross-package seam in one place means a future drift in schema's export
 * names only needs to be reconciled in this one file.
 */
import type { EntityId, PipelineStageId } from '@topview/schema';

export type { EntityId, PipelineStageId };

/**
 * A reference to a stored artifact (video, frame image, point cloud file,
 * mesh, exported document, ...). Plugins never receive raw bytes inline --
 * they receive a `DataRef` and are responsible for resolving it through
 * whatever storage/compute backend the host injected (see
 * `PluginExecutionContext`).
 */
export interface DataRef {
  readonly id: string;
  readonly uri: string;
  readonly mimeType?: string;
  readonly sizeBytes?: number;
}

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface Point3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface BoundingBox3D {
  readonly min: Point3D;
  readonly max: Point3D;
}

export interface CameraIntrinsics {
  readonly focalLengthPx: readonly [number, number];
  readonly principalPointPx: readonly [number, number];
  readonly skew?: number;
}

export interface CameraPose {
  readonly frameId: string;
  readonly position: Point3D;
  /** Orientation as a unit quaternion, [x, y, z, w]. */
  readonly rotation: readonly [number, number, number, number];
  readonly intrinsics?: CameraIntrinsics;
}

/**
 * Open string union: a fixed set of well-known entity kinds for editor/IDE
 * ergonomics, while still accepting any plugin-defined string via the
 * `(string & {})` widening trick (plain `string` would swallow the literals
 * and lose autocomplete).
 */
export type EntityKind =
  | 'wall'
  | 'corner'
  | 'door'
  | 'window'
  | 'opening'
  | 'room'
  | 'furniture'
  | 'annotation'
  | (string & {});

export type ValidationStatus = 'unreviewed' | 'auto-accepted' | 'accepted' | 'user-rejected';

export interface DetectedEntityGeometry {
  readonly points2D?: readonly Point2D[];
  readonly points3D?: readonly Point3D[];
}

/**
 * A candidate entity produced by a `FeatureDetector` (or carried forward by a
 * `ReconstructionAlgorithm`/`SpatialAnalyzer`). This is deliberately a
 * *richer, provisional* shape than the schema package's finalized project
 * entity model -- it carries detector provenance and confidence so the
 * review workflow (accept / reject / edit) has something to hang off of
 * before an entity is merged into a project's authoritative scene graph.
 */
export interface DetectedEntity {
  readonly id: EntityId;
  readonly kind: EntityKind;
  readonly geometry: DetectedEntityGeometry;
  /** Detector-reported confidence in [0, 1]. */
  readonly confidence: number;
  readonly sourcePluginId: string;
  readonly sourceManifestId: string;
  validationStatus: ValidationStatus;
  readonly properties?: Readonly<Record<string, unknown>>;
}
