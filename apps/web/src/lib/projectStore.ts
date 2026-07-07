/**
 * Local persistence for one working project (PRS §21). Uses `localStorage`
 * rather than IndexedDB for this pass -- simpler and adequate for a handful
 * of vector entities, though it won't scale to an inlined dense point cloud
 * (docs/roadmap.md notes IndexedDB as the follow-up for that). Version
 * history is simplified to "the last N autosaves" rather than the full
 * diff-chained `ProjectVersion` model `@topview/schema` defines.
 */
import { createEmptyProjectDocument, createTopviewProjectFile, type AnyEntity, type ProjectDocument } from '@topview/schema';

const STORAGE_KEY = 'topview.project.local';
const MAX_HISTORY = 10;

interface StoredHistoryEntry {
  readonly savedAt: string;
  readonly document: ProjectDocument;
}

interface StoredProject {
  readonly current: ProjectDocument;
  readonly history: StoredHistoryEntry[];
}

function readStore(): StoredProject | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredProject;
  } catch {
    return null;
  }
}

function writeStore(store: StoredProject): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function loadProject(): ProjectDocument | null {
  return readStore()?.current ?? null;
}

export function loadHistory(): StoredHistoryEntry[] {
  return readStore()?.history ?? [];
}

/** Autosaves the current entity set, keeping the previous document as one history entry. */
export function saveProject(entities: readonly AnyEntity[], projectName = 'Untitled Project'): ProjectDocument {
  const existing = readStore();
  const now = new Date().toISOString();

  const document: ProjectDocument =
    existing?.current ??
    createEmptyProjectDocument({
      projectId: `local-${Date.now()}`,
      name: projectName,
      sourceMedia: { kind: 'image-sequence', uri: 'local://synthetic-sample' },
    });

  const nextDocument: ProjectDocument = {
    ...document,
    entities: Object.fromEntries(entities.map((e) => [e.id, e])),
    updatedAt: now,
  };

  const history = existing ? [{ savedAt: now, document: existing.current }, ...existing.history].slice(0, MAX_HISTORY) : [];
  writeStore({ current: nextDocument, history });
  return nextDocument;
}

export function clearProject(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Serializes the current project to a downloadable `.topview` JSON file. */
export function exportProjectFile(document: ProjectDocument): string {
  return JSON.stringify(createTopviewProjectFile(document), null, 2);
}
