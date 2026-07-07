/**
 * The event channel `PipelineRunner.on()` exposes. `PipelineEvent` itself
 * (and its `StageProgressEvent` / `StageLifecycleEvent` / `PipelineErrorEvent`
 * variants) is defined once in `@topview/schema` so the browser runner and
 * `services/reconstruction-api`'s hand-mirrored Pydantic models agree on the
 * wire shape (see docs/architecture.md).
 */
import type { PipelineEvent } from '@topview/schema';

export type { PipelineEvent } from '@topview/schema';

export type PipelineEventListener = (event: PipelineEvent) => void;

/** Unsubscribe function returned by {@link PipelineEventEmitter.on}. */
export type Unsubscribe = () => void;

let eventSequence = 0;

/** Monotonic-ish unique id for one `PipelineEvent`; not a security token. */
export function makeEventId(): string {
  eventSequence += 1;
  return `evt_${Date.now().toString(36)}_${eventSequence.toString(36)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Minimal, dependency-free pub-sub used by `PipelineRunner`. Deliberately not
 * built on Node's `EventEmitter` (unavailable in the browser) or the DOM's
 * `EventTarget` (would force every event through `CustomEvent` wrapping) --
 * plain callbacks are enough for the one-channel-many-listeners shape here.
 */
export class PipelineEventEmitter {
  private readonly listeners = new Set<PipelineEventListener>();

  on(listener: PipelineEventListener): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: PipelineEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
