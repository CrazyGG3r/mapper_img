/**
 * The `.topview` project file format and the persistence shapes it wraps:
 * `ProjectDocument` (the live/working project state) and `ProjectVersion`
 * (one row of version history). These are the single on-disk shape used
 * both for local IndexedDB storage (`computeMode: 'local'`) and for
 * backend-persisted storage once `computeMode !== 'local'` — see
 * docs/architecture.md §8 and apps/web's `src/project/` (`AutosaveManager`).
 */
import type { AnyEntity, CameraPose, EntityId, IsoTimestamp, PointCloud } from './entities';
import type { PipelineStageId } from './pipeline';

/** Where the heavy compute stages run. Selected in `apps/web/src/settings/`. */
export type ComputeMode = 'local' | 'backend' | 'cloud';

/** How the source media for a project was captured. */
export type SourceKind = 'video' | 'image-sequence';

/** Reference to the raw input a project was built from (a walkthrough video, or a frame set). */
export interface SourceMediaRef {
  kind: SourceKind;
  /** Local blob URI, or a backend/cloud-relative storage path, depending on `computeMode`. */
  uri: string;
  frameCount?: number;
  durationSeconds?: number;
  fps?: number;
}

/** A named, orderable, toggleable layer that entities are drawn on. */
export interface ProjectLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  order: number;
}

/** Records that a pipeline stage has completed for this project, and which plugin ran it. */
export interface StageCompletionRecord {
  stage: PipelineStageId;
  completedAt: IsoTimestamp;
  pluginId?: string;
}

/**
 * The in-memory / IndexedDB / backend-persisted shape of one project. This
 * is the payload wrapped by the on-disk `.topview` file (`TopviewProjectFile`
 * below), and is what the SVG editor's `EditorSceneState`
 * (`apps/web/src/svg-editor/types.ts`) is hydrated from and flattened back
 * into on save.
 */
export interface ProjectDocument {
  projectId: string;
  name: string;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  computeMode: ComputeMode;
  sourceMedia: SourceMediaRef;
  entities: Record<EntityId, AnyEntity>;
  layers: ProjectLayer[];
  activeLayerId: string;
  cameraPoses: CameraPose[];
  /** Present once `point-cloud-generation` has run; may reference external storage, see PointCloudStorage. */
  pointCloud?: PointCloud;
  completedStages: StageCompletionRecord[];
  /** `ProjectVersion.id` of the version this document currently reflects, or `null` before the first save. */
  currentVersionId: string | null;
}

/** Constructs a fresh, empty `ProjectDocument` with sane defaults for every field the caller doesn't supply. */
export function createEmptyProjectDocument(
  init: Pick<ProjectDocument, 'projectId' | 'name' | 'sourceMedia'> & Partial<ProjectDocument>,
): ProjectDocument {
  const now = new Date().toISOString();
  const defaultLayerId = 'layer-default';
  return {
    createdAt: now,
    updatedAt: now,
    computeMode: 'local',
    entities: {},
    layers: [{ id: defaultLayerId, name: 'Default', visible: true, locked: false, order: 0 }],
    activeLayerId: defaultLayerId,
    cameraPoses: [],
    completedStages: [],
    currentVersionId: null,
    ...init,
  };
}

/** One RFC-6902-flavored JSON Patch operation, used by diff-mode `ProjectVersion` snapshots. */
export interface JsonPatchOperation {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: unknown;
  from?: string;
}

/**
 * How one `ProjectVersion` stores its snapshot: a full document (cheap to
 * restore, expensive to store many of), or a JSON-Patch diff against
 * `parentVersionId` (the reverse tradeoff). `AutosaveManager` switches from
 * `full` to `diff` past a configurable version count to bound storage
 * growth — see docs/performance.md.
 */
export type ProjectVersionSnapshotRef =
  | { mode: 'full'; document: ProjectDocument }
  | { mode: 'diff'; parentVersionId: string; patch: JsonPatchOperation[] };

/** What caused a `ProjectVersion` to be recorded. */
export type ProjectVersionTrigger = 'autosave' | 'manual' | 'stage-completed' | 'restore';

/**
 * One row in a project's version history (apps/web/src/project/, see
 * docs/architecture.md §8). Chains via `parentVersionId`. Restoring an
 * older version is itself pushed as a single consolidated `EditorCommand`,
 * so restore-to-version is exactly as undoable as any other edit.
 */
export interface ProjectVersion {
  id: string;
  projectId: string;
  parentVersionId: string | null;
  createdAt: IsoTimestamp;
  label?: string;
  triggeredBy: ProjectVersionTrigger;
  snapshotRef: ProjectVersionSnapshotRef;
}

/** Current semver of the `.topview` file format, independent of any package's own version. */
export const TOPVIEW_PROJECT_FORMAT_VERSION = '1.0.0';

/**
 * The on-disk / exported `.topview` project file envelope (PRS §21). This
 * is what gets written to and read from a `.topview` file on the user's
 * filesystem (or downloaded/uploaded as a single artifact); `$schema`
 * points at the generated JSON Schema counterpart (see
 * src/schemas/project-document.schema.json and scripts/copy-schemas.mjs).
 */
export interface TopviewProjectFile {
  $schema?: string;
  formatVersion: string;
  document: ProjectDocument;
  /** Bundled version history, present only when the export explicitly includes it. */
  versions?: ProjectVersion[];
}

/** Wraps a `ProjectDocument` (and optional version history) into a `.topview` file envelope. */
export function createTopviewProjectFile(
  document: ProjectDocument,
  versions?: ProjectVersion[],
): TopviewProjectFile {
  return {
    formatVersion: TOPVIEW_PROJECT_FORMAT_VERSION,
    document,
    ...(versions ? { versions } : {}),
  };
}
