import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  createDefaultConfidenceMeta,
  createEmptyProjectDocument,
  createTopviewProjectFile,
  EXPORT_FORMAT_DESCRIPTORS,
  PIPELINE_STAGE_IDS,
  TOPVIEW_PROJECT_FORMAT_VERSION,
  type AnyEntity,
  type CameraPose,
  type ConfidenceMeta,
  type Corner,
  type DetectedEntity,
  type Door,
  type EntityId,
  type ExportOptions,
  type Furniture,
  type PipelineErrorEvent,
  type PipelineEvent,
  type PipelineStageId,
  type PointCloud,
  type ProjectDocument,
  type ProjectVersion,
  type Room,
  type StageLifecycleEvent,
  type StageProgressEvent,
  type SvgExportOptions,
  type Wall,
  type Window,
} from './index';

describe('@topview/schema — type shape', () => {
  it('EntityId is a plain string alias', () => {
    expectTypeOf<EntityId>().toEqualTypeOf<string>();
  });

  it('every concrete entity kind is assignable to AnyEntity', () => {
    expectTypeOf<Wall>().toMatchTypeOf<AnyEntity>();
    expectTypeOf<Corner>().toMatchTypeOf<AnyEntity>();
    expectTypeOf<Door>().toMatchTypeOf<AnyEntity>();
    expectTypeOf<Window>().toMatchTypeOf<AnyEntity>();
    expectTypeOf<Room>().toMatchTypeOf<AnyEntity>();
    expectTypeOf<Furniture>().toMatchTypeOf<AnyEntity>();
  });

  it('DetectedEntity is interchangeable with AnyEntity', () => {
    expectTypeOf<DetectedEntity>().toEqualTypeOf<AnyEntity>();
  });

  it('PipelineEvent is exactly the three documented variants', () => {
    expectTypeOf<StageProgressEvent>().toMatchTypeOf<PipelineEvent>();
    expectTypeOf<StageLifecycleEvent>().toMatchTypeOf<PipelineEvent>();
    expectTypeOf<PipelineErrorEvent>().toMatchTypeOf<PipelineEvent>();
  });

  it('ProjectDocument.entities is keyed by EntityId', () => {
    expectTypeOf<ProjectDocument['entities']>().toEqualTypeOf<Record<EntityId, AnyEntity>>();
  });
});

describe('@topview/schema — runtime shape', () => {
  it('createDefaultConfidenceMeta produces a fully-formed, user-authored ConfidenceMeta', () => {
    const meta: ConfidenceMeta = createDefaultConfidenceMeta();
    expect(meta).toEqual({
      score: 1,
      source: 'user',
      validationStatus: 'user-accepted',
    });
  });

  it('createDefaultConfidenceMeta accepts overrides for a detector-produced entity', () => {
    const meta = createDefaultConfidenceMeta({
      score: 0.82,
      source: 'detector',
      sourcePluginId: 'topview.detector.example-wall-heuristic',
      validationStatus: 'unreviewed',
    });
    expect(meta.source).toBe('detector');
    expect(meta.sourcePluginId).toBe('topview.detector.example-wall-heuristic');
  });

  it('an example Wall entity round-trips through the AnyEntity union', () => {
    const wall: Wall = {
      id: 'wall-1',
      kind: 'wall',
      layerId: 'layer-default',
      confidence: createDefaultConfidenceMeta({
        source: 'detector',
        score: 0.91,
        validationStatus: 'user-rejected',
      }),
      createdAt: '2026-07-06T00:00:00.000Z',
      updatedAt: '2026-07-06T00:00:00.000Z',
      start: { x: 0, y: 0 },
      end: { x: 3.2, y: 0 },
      thicknessM: 0.15,
    };
    const entities: Record<EntityId, AnyEntity> = { [wall.id]: wall };
    expect(entities['wall-1']!.kind).toBe('wall');
    expect(entities['wall-1']!.confidence.validationStatus).toBe('user-rejected');
  });

  it('PIPELINE_STAGE_IDS lists exactly the 11 documented stages in order', () => {
    const expected: PipelineStageId[] = [
      'upload',
      'frame-extraction',
      'feature-detection',
      'camera-reconstruction',
      'point-cloud-generation',
      'geometry-recovery',
      'wall-detection',
      'furniture-detection',
      'layout-generation',
      'svg-cleanup',
      'export',
    ];
    expect(PIPELINE_STAGE_IDS).toEqual(expected);
    expect(PIPELINE_STAGE_IDS).toHaveLength(11);
  });

  it('an example StageProgressEvent matches the documented wire shape', () => {
    const event: PipelineEvent = {
      type: 'stage:progress',
      eventId: 'evt-1',
      runId: 'run-1',
      projectId: 'project-1',
      timestamp: '2026-07-06T00:00:00.000Z',
      stage: 'feature-detection',
      fraction: 0.4,
      detail: {},
    };
    expect(event.type).toBe('stage:progress');
    if (event.type === 'stage:progress') {
      expect(event.fraction).toBeGreaterThanOrEqual(0);
      expect(event.fraction).toBeLessThanOrEqual(1);
    }
  });

  it('createEmptyProjectDocument fills in sane defaults', () => {
    const doc: ProjectDocument = createEmptyProjectDocument({
      projectId: 'project-1',
      name: 'My Apartment',
      sourceMedia: { kind: 'video', uri: 'blob://local/walkthrough.mp4' },
    });
    expect(doc.computeMode).toBe('local');
    expect(doc.entities).toEqual({});
    expect(doc.layers).toHaveLength(1);
    expect(doc.activeLayerId).toBe(doc.layers[0]?.id);
    expect(doc.currentVersionId).toBeNull();
  });

  it('createTopviewProjectFile wraps a ProjectDocument at the current format version', () => {
    const doc = createEmptyProjectDocument({
      projectId: 'project-1',
      name: 'My Apartment',
      sourceMedia: { kind: 'image-sequence', uri: 'blob://local/frames/' },
    });
    const file = createTopviewProjectFile(doc);
    expect(file.formatVersion).toBe(TOPVIEW_PROJECT_FORMAT_VERSION);
    expect(file.document).toBe(doc);
    expect(file.versions).toBeUndefined();
  });

  it('a ProjectVersion can reference either a full or diff snapshot', () => {
    const full: ProjectVersion = {
      id: 'v1',
      projectId: 'project-1',
      parentVersionId: null,
      createdAt: '2026-07-06T00:00:00.000Z',
      triggeredBy: 'manual',
      snapshotRef: {
        mode: 'full',
        document: createEmptyProjectDocument({
          projectId: 'project-1',
          name: 'My Apartment',
          sourceMedia: { kind: 'video', uri: 'blob://local/walkthrough.mp4' },
        }),
      },
    };
    const diff: ProjectVersion = {
      id: 'v2',
      projectId: 'project-1',
      parentVersionId: 'v1',
      createdAt: '2026-07-06T00:05:00.000Z',
      triggeredBy: 'autosave',
      snapshotRef: {
        mode: 'diff',
        parentVersionId: 'v1',
        patch: [{ op: 'replace', path: '/name', value: 'My Loft' }],
      },
    };
    expect(full.snapshotRef.mode).toBe('full');
    expect(diff.snapshotRef.mode).toBe('diff');
  });

  it('a CameraPose and PointCloud shape check out', () => {
    const pose: CameraPose = {
      frameId: 'frame-0001',
      position: { x: 0, y: 1.6, z: 0 },
      rotationQuaternion: [0, 0, 0, 1],
    };
    const cloud: PointCloud = {
      id: 'cloud-1',
      runId: 'run-1',
      storage: { mode: 'inline', points: [{ position: { x: 0, y: 0, z: 0 } }] },
      createdAt: '2026-07-06T00:00:00.000Z',
    };
    expect(pose.rotationQuaternion).toHaveLength(4);
    expect(cloud.storage.mode).toBe('inline');
  });

  it('every declared export format descriptor has a matching ExportOptions discriminant', () => {
    const svgOptions: SvgExportOptions = {
      format: 'svg',
      unitsPerMeter: 96,
      includeLayers: [],
      embedMetadata: true,
    };
    const options: ExportOptions = svgOptions;
    expect(options.format).toBe('svg');
    expect(EXPORT_FORMAT_DESCRIPTORS.map((d) => d.id)).toEqual([
      'svg',
      'dxf',
      'json',
      'geojson',
      'obj',
      'gltf',
      'ply',
    ]);
  });
});
