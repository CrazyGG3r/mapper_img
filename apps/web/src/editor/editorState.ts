/**
 * The SVG editor's command-pattern undo/redo model (PRS §15,
 * docs/architecture.md). Every mutation -- dragging a vertex, accepting or
 * rejecting a detected entity -- goes through an `EditorCommand`, so
 * geometry edits and metadata edits are equally undoable through one stack.
 */
import type { AnyEntity, EntityId, ValidationStatus } from '@topview/schema';

export interface EditorSceneState {
  readonly entities: Readonly<Record<EntityId, AnyEntity>>;
}

export interface EditorCommand {
  readonly label: string;
  apply(state: EditorSceneState): EditorSceneState;
  /** Builds the command that undoes this one, evaluated against the state this command is about to be applied to. */
  invert(state: EditorSceneState): EditorCommand;
}

type WallVertex = 'start' | 'end';

/** Moves one endpoint of a `Wall` (or the position of a `Corner`/`Furniture` anchor) -- the drag-a-vertex interaction. */
export class MoveVertexCommand implements EditorCommand {
  readonly label = 'Move vertex';

  constructor(
    private readonly entityId: EntityId,
    private readonly vertex: WallVertex,
    private readonly to: { x: number; y: number },
  ) {}

  apply(state: EditorSceneState): EditorSceneState {
    const entity = state.entities[this.entityId];
    if (!entity || entity.kind !== 'wall') return state;
    const updated: AnyEntity = { ...entity, [this.vertex]: this.to, updatedAt: new Date().toISOString() };
    return { entities: { ...state.entities, [this.entityId]: updated } };
  }

  invert(state: EditorSceneState): EditorCommand {
    const entity = state.entities[this.entityId];
    const from = entity && entity.kind === 'wall' ? entity[this.vertex] : this.to;
    return new MoveVertexCommand(this.entityId, this.vertex, from);
  }
}

/** Accepts/rejects/re-reviews a detected entity -- exactly as undoable as dragging its geometry. */
export class SetValidationStatusCommand implements EditorCommand {
  readonly label = 'Change review status';

  constructor(
    private readonly entityId: EntityId,
    private readonly status: ValidationStatus,
  ) {}

  apply(state: EditorSceneState): EditorSceneState {
    const entity = state.entities[this.entityId];
    if (!entity) return state;
    const updated: AnyEntity = {
      ...entity,
      confidence: { ...entity.confidence, validationStatus: this.status, reviewedAt: new Date().toISOString() },
      updatedAt: new Date().toISOString(),
    };
    return { entities: { ...state.entities, [this.entityId]: updated } };
  }

  invert(state: EditorSceneState): EditorCommand {
    const entity = state.entities[this.entityId];
    return new SetValidationStatusCommand(this.entityId, entity?.confidence.validationStatus ?? 'unreviewed');
  }
}

/** Deletes an entity outright (e.g. rejecting a spurious detection permanently rather than just flagging it). */
export class DeleteEntityCommand implements EditorCommand {
  readonly label = 'Delete entity';
  private removed: AnyEntity | null = null;

  constructor(private readonly entityId: EntityId) {}

  apply(state: EditorSceneState): EditorSceneState {
    if (!(this.entityId in state.entities)) return state;
    const { [this.entityId]: removed, ...rest } = state.entities;
    this.removed = removed ?? null;
    return { entities: rest };
  }

  invert(state: EditorSceneState): EditorCommand {
    const entity = state.entities[this.entityId] ?? this.removed;
    return new RestoreEntityCommand(entity ?? null);
  }
}

class RestoreEntityCommand implements EditorCommand {
  readonly label = 'Restore entity';
  constructor(private readonly entity: AnyEntity | null) {}

  apply(state: EditorSceneState): EditorSceneState {
    if (!this.entity) return state;
    return { entities: { ...state.entities, [this.entity.id]: this.entity } };
  }

  invert(_state: EditorSceneState): EditorCommand {
    return this.entity ? new DeleteEntityCommand(this.entity.id) : new RestoreEntityCommand(null);
  }
}

/**
 * A minimal, framework-agnostic undo/redo stack: `push` applies a command,
 * capturing its inverse; `undo`/`redo` walk the two stacks, recomputing each
 * step's own inverse against the state at that point so a redo-after-undo
 * always lands back on exactly the right state.
 */
export class UndoRedoStack {
  private undoStack: EditorCommand[] = [];
  private redoStack: EditorCommand[] = [];

  constructor(
    private readonly getState: () => EditorSceneState,
    private readonly setState: (next: EditorSceneState) => void,
  ) {}

  push(command: EditorCommand): void {
    const state = this.getState();
    const inverse = command.invert(state);
    this.setState(command.apply(state));
    this.undoStack.push(inverse);
    this.redoStack = [];
  }

  undo(): void {
    const command = this.undoStack.pop();
    if (!command) return;
    const state = this.getState();
    const inverse = command.invert(state);
    this.setState(command.apply(state));
    this.redoStack.push(inverse);
  }

  redo(): void {
    const command = this.redoStack.pop();
    if (!command) return;
    const state = this.getState();
    const inverse = command.invert(state);
    this.setState(command.apply(state));
    this.undoStack.push(inverse);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
