import type { Exporter } from './exporter.js';
import type { FeatureDetector } from './detector.js';
import type { PluginKind, PluginManifest } from './manifest.js';
import type { ReconstructionAlgorithm } from './reconstruction.js';
import { satisfiesRange } from './semver.js';
import type { SpatialAnalyzer } from './spatial-analyzer.js';
import type { VisualizationMode } from './visualization.js';

export type AnyPluginInstance =
  | FeatureDetector<unknown>
  | ReconstructionAlgorithm<unknown>
  | Exporter<unknown>
  | VisualizationMode<unknown>
  | SpatialAnalyzer<unknown>;

export type PluginFactory<T extends AnyPluginInstance = AnyPluginInstance> = () => T;

export interface RegisteredPlugin<T extends AnyPluginInstance = AnyPluginInstance> {
  readonly manifest: PluginManifest;
  readonly instance: T;
}

export type PluginRegistrationErrorCode =
  | 'duplicate-id'
  | 'incompatible-sdk-version'
  | 'manifest-id-mismatch'
  | 'kind-mismatch';

export class PluginRegistrationError extends Error {
  readonly code: PluginRegistrationErrorCode;
  readonly manifestId: string;

  constructor(code: PluginRegistrationErrorCode, manifestId: string, message: string) {
    super(message);
    this.name = 'PluginRegistrationError';
    this.code = code;
    this.manifestId = manifestId;
  }
}

export type PluginRegistrationResult<T extends AnyPluginInstance = AnyPluginInstance> =
  | { readonly ok: true; readonly plugin: RegisteredPlugin<T> }
  | { readonly ok: false; readonly error: PluginRegistrationError };

export interface PluginRegistryOptions {
  /**
   * The `@topview/plugin-sdk` version this host has installed. Every plugin's
   * declared `manifest.sdkVersionRange` is checked against this at
   * registration time.
   */
  readonly installedSdkVersion: string;
}

function shapeMatchesKind(instance: AnyPluginInstance, kind: PluginKind): boolean {
  switch (kind) {
    case 'feature-detector':
      return typeof (instance as FeatureDetector).detect === 'function' && Array.isArray((instance as FeatureDetector).detects);
    case 'reconstruction-algorithm':
      return typeof (instance as ReconstructionAlgorithm).reconstruct === 'function';
    case 'exporter':
      return typeof (instance as Exporter).export === 'function';
    case 'visualization-mode':
      return typeof (instance as VisualizationMode).render === 'function';
    case 'spatial-analyzer':
      return typeof (instance as SpatialAnalyzer).analyze === 'function';
    default:
      return false;
  }
}

/**
 * In-memory registry of installed plugins. Constructed once per host (the
 * web app's local runtime, or a backend compute worker) via
 * `createPluginRegistry(installedSdkVersion)` and handed to
 * `createPipelineRunner()` (see `@topview/pipeline-core`).
 */
export class PluginRegistry {
  private readonly installedSdkVersion: string;
  private readonly plugins = new Map<string, RegisteredPlugin>();

  constructor(options: PluginRegistryOptions) {
    this.installedSdkVersion = options.installedSdkVersion;
  }

  /** Registers a plugin, throwing a {@link PluginRegistrationError} on failure. */
  register<T extends AnyPluginInstance>(manifest: PluginManifest, factory: PluginFactory<T>): RegisteredPlugin<T> {
    const result = this.tryRegister(manifest, factory);
    if (!result.ok) {
      throw result.error;
    }
    return result.plugin;
  }

  /** Same as {@link register}, but returns a result object instead of throwing. */
  tryRegister<T extends AnyPluginInstance>(
    manifest: PluginManifest,
    factory: PluginFactory<T>,
  ): PluginRegistrationResult<T> {
    if (this.plugins.has(manifest.id)) {
      return {
        ok: false,
        error: new PluginRegistrationError(
          'duplicate-id',
          manifest.id,
          `A plugin with id "${manifest.id}" is already registered.`,
        ),
      };
    }

    if (!satisfiesRange(this.installedSdkVersion, manifest.sdkVersionRange)) {
      return {
        ok: false,
        error: new PluginRegistrationError(
          'incompatible-sdk-version',
          manifest.id,
          `Plugin "${manifest.id}" requires @topview/plugin-sdk "${manifest.sdkVersionRange}" ` +
            `but the host has "${this.installedSdkVersion}".`,
        ),
      };
    }

    const instance = factory();

    if (instance.manifestId !== manifest.id) {
      return {
        ok: false,
        error: new PluginRegistrationError(
          'manifest-id-mismatch',
          manifest.id,
          `Plugin instance manifestId "${instance.manifestId}" does not match manifest.id "${manifest.id}".`,
        ),
      };
    }

    if (!shapeMatchesKind(instance, manifest.kind)) {
      return {
        ok: false,
        error: new PluginRegistrationError(
          'kind-mismatch',
          manifest.id,
          `Plugin "${manifest.id}" declares kind "${manifest.kind}" but its instance does not implement the matching interface.`,
        ),
      };
    }

    const registered: RegisteredPlugin<T> = { manifest, instance };
    this.plugins.set(manifest.id, registered as RegisteredPlugin);
    return { ok: true, plugin: registered };
  }

  /**
   * Removes a plugin and fires its `dispose()` (not awaited -- callers that
   * need to await disposal before continuing should `get()` the plugin and
   * await `instance.dispose()` themselves before calling `unregister`).
   */
  unregister(id: string): boolean {
    const existing = this.plugins.get(id);
    if (!existing) return false;
    void existing.instance.dispose();
    return this.plugins.delete(id);
  }

  get<T extends AnyPluginInstance = AnyPluginInstance>(id: string): RegisteredPlugin<T> | undefined {
    return this.plugins.get(id) as RegisteredPlugin<T> | undefined;
  }

  has(id: string): boolean {
    return this.plugins.has(id);
  }

  list(filter?: { kind?: PluginKind }): readonly RegisteredPlugin[] {
    const all = Array.from(this.plugins.values());
    if (!filter?.kind) return all;
    return all.filter((registered) => registered.manifest.kind === filter.kind);
  }

  /** Finds every registered plugin implementing a given plugin kind. */
  discoverByCapability(kind: PluginKind): readonly RegisteredPlugin[] {
    return this.list({ kind });
  }

  get size(): number {
    return this.plugins.size;
  }
}

export function createPluginRegistry(installedSdkVersion: string): PluginRegistry {
  return new PluginRegistry({ installedSdkVersion });
}
