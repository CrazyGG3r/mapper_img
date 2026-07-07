// Foundational / shared types
export type {
  BoundingBox3D,
  CameraIntrinsics,
  CameraPose,
  DataRef,
  DetectedEntity,
  DetectedEntityGeometry,
  EntityId,
  EntityKind,
  PipelineStageId,
  Point2D,
  Point3D,
  ValidationStatus,
} from './common.js';

// Execution context passed to every plugin invocation
export type { PluginExecutionContext, PluginLogger } from './context.js';

// Manifest contract
export { SDK_VERSION } from './manifest.js';
export type { PluginKind, PluginManifest } from './manifest.js';

// Plugin kind: feature detection
export type { FeatureDetectionRequest, FeatureDetector } from './detector.js';

// Plugin kind: reconstruction algorithms
export type {
  ReconstructionAlgorithm,
  ReconstructionArtifactKind,
  ReconstructionRequest,
  ReconstructionResult,
} from './reconstruction.js';

// Plugin kind: exporters
export type { ExportRequest, ExportResult, Exporter } from './exporter.js';

// Plugin kind: visualization modes
export type {
  VisualizationHandle,
  VisualizationMode,
  VisualizationRenderRequest,
} from './visualization.js';

// Plugin kind: spatial analyzers
export type {
  SpatialAnalysisRequest,
  SpatialAnalysisResult,
  SpatialAnalyzer,
  SpatialMetric,
} from './spatial-analyzer.js';

// Registry
export {
  createPluginRegistry,
  PluginRegistrationError,
  PluginRegistry,
} from './registry.js';
export type {
  AnyPluginInstance,
  PluginFactory,
  PluginRegistrationErrorCode,
  PluginRegistrationResult,
  PluginRegistryOptions,
  RegisteredPlugin,
} from './registry.js';

// Semver utilities (used internally for sdkVersionRange compat checks; exposed
// so hosts can pre-flight plugin compatibility, e.g. in a plugin marketplace UI).
export { compareSemVer, parseSemVer, satisfiesRange } from './semver.js';
export type { ParsedSemVer } from './semver.js';
