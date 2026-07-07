import type { EntityKind } from './common.js';

/**
 * The version of the `@topview/plugin-sdk` contract itself. Bump this
 * alongside any breaking change to the interfaces exported from this
 * package, and keep it in lockstep with `package.json#version`. Hosts pass
 * this (or their own pinned copy of it) into `createPluginRegistry()` so
 * registration can reject plugins built against an incompatible SDK range.
 */
export const SDK_VERSION = '0.1.0';

export type PluginKind =
  | 'feature-detector'
  | 'reconstruction-algorithm'
  | 'exporter'
  | 'visualization-mode'
  | 'spatial-analyzer';

/**
 * The parsed shape of a plugin's `plugin.manifest.json`. Field names here are
 * the canonical contract -- each plugin's own plugin.manifest.json file and the
 * plugin discovery mechanism in `apps/web/src/plugins-runtime/` must match
 * this exactly.
 */
export interface PluginManifest {
  /** Globally unique, reverse-DNS-style id, e.g. "topview.detector.example-wall-heuristic". */
  readonly id: string;
  readonly name: string;
  /** Semver of the plugin package itself. */
  readonly version: string;
  readonly kind: PluginKind;
  /**
   * Semver range of `@topview/plugin-sdk` this plugin was built against,
   * e.g. "^0.1.0". Checked against the host's `installedSdkVersion` at
   * registration time.
   */
  readonly sdkVersionRange: string;
  readonly description?: string;
  /** Entity kinds a `feature-detector` plugin can produce; ignored by other kinds. */
  readonly detects?: readonly EntityKind[];
  /** JSON Schema describing the plugin's `configure()` input, used to auto-generate settings UI. */
  readonly configSchema?: Readonly<Record<string, unknown>>;
  /** Path (relative to the manifest file) to the compiled entry point exporting a default `registerPlugin()`. */
  readonly entryPoint: string;
  readonly author?: string;
  readonly homepage?: string;
}
