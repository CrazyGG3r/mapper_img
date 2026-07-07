import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { AnyEntity, Point2D, Wall } from '@topview/schema';
import { MoveVertexCommand, SetValidationStatusCommand, UndoRedoStack, type EditorSceneState } from './editorState.js';

export interface EditorProps {
  readonly initialEntities: readonly AnyEntity[];
  /** Bump whenever a fresh pipeline run should replace the editor's working state (and undo history). */
  readonly generation: number;
  readonly onEntitiesChange: (entities: AnyEntity[]) => void;
}

const UNITS_PER_METER = 80;
const PADDING_M = 0.6;

function indexById(entities: readonly AnyEntity[]): Record<string, AnyEntity> {
  const map: Record<string, AnyEntity> = {};
  for (const e of entities) map[e.id] = e;
  return map;
}

function isWall(e: AnyEntity): e is Wall {
  return e.kind === 'wall';
}

function computeTransform(walls: readonly Wall[]): { minX: number; minY: number; scale: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const w of walls) {
    for (const p of [w.start, w.end]) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, scale: UNITS_PER_METER };
  return { minX: minX - PADDING_M, minY: minY - PADDING_M, scale: UNITS_PER_METER };
}

export function Editor({ initialEntities, generation, onEntitiesChange }: EditorProps): JSX.Element {
  const [state, setState] = useState<EditorSceneState>(() => ({ entities: indexById(initialEntities) }));
  const stateRef = useRef(state);
  stateRef.current = state;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ entityId: string; vertex: 'start' | 'end' } | null>(null);
  const [dragPoint, setDragPoint] = useState<Point2D | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    setState({ entities: indexById(initialEntities) });
    setSelectedId(null);
    // Intentionally keyed on `generation` alone, not `initialEntities` identity.
  }, [generation]);

  // A fresh stack per pipeline run is intentional -- keyed on `generation`.
  const stack = useMemo(() => new UndoRedoStack(() => stateRef.current, setState), [generation]);

  useEffect(() => {
    onEntitiesChange(Object.values(state.entities));
    // onEntitiesChange is expected to be stable enough for this demo.
  }, [state]);

  const walls = useMemo(() => Object.values(state.entities).filter(isWall), [state]);
  const transform = useMemo(() => computeTransform(walls), [walls]);

  const toMeters = (clientX: number, clientY: number): Point2D | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const local = point.matrixTransform(ctm.inverse());
    return { x: local.x / transform.scale + transform.minX, y: local.y / transform.scale + transform.minY };
  };

  const toPx = (p: Point2D): Point2D => ({
    x: (p.x - transform.minX) * transform.scale,
    y: (p.y - transform.minY) * transform.scale,
  });

  const handlePointerDown = (entityId: string, vertex: 'start' | 'end') => (e: ReactPointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setSelectedId(entityId);
    setDragging({ entityId, vertex });
    setDragPoint(vertex === 'start' ? (state.entities[entityId] as Wall).start : (state.entities[entityId] as Wall).end);
  };

  const handlePointerMove = (e: ReactPointerEvent) => {
    if (!dragging) return;
    const meters = toMeters(e.clientX, e.clientY);
    if (meters) setDragPoint(meters);
  };

  const handlePointerUp = () => {
    if (dragging && dragPoint) {
      stack.push(new MoveVertexCommand(dragging.entityId, dragging.vertex, dragPoint));
    }
    setDragging(null);
    setDragPoint(null);
  };

  const selectedWall = selectedId ? (state.entities[selectedId] as Wall | undefined) : undefined;
  const viewWidth = Math.max(100, ...walls.flatMap((w) => [toPx(w.start).x, toPx(w.end).x])) + PADDING_M * transform.scale;
  const viewHeight = Math.max(100, ...walls.flatMap((w) => [toPx(w.start).y, toPx(w.end).y])) + PADDING_M * transform.scale;

  return (
    <div>
      <div className="editor-toolbar">
        <button className="secondary" onClick={() => stack.undo()} disabled={!stack.canUndo}>
          Undo
        </button>
        <button className="secondary" onClick={() => stack.redo()} disabled={!stack.canRedo}>
          Redo
        </button>
        {selectedWall && (
          <>
            <button
              className="secondary"
              onClick={() => stack.push(new SetValidationStatusCommand(selectedWall.id, 'user-accepted'))}
            >
              Accept selected wall
            </button>
            <button
              className="secondary"
              onClick={() => stack.push(new SetValidationStatusCommand(selectedWall.id, 'user-rejected'))}
            >
              Reject selected wall
            </button>
          </>
        )}
      </div>

      {walls.length === 0 ? (
        <p className="muted">Run the pipeline to get walls you can drag and review here.</p>
      ) : (
        <>
          <svg
            ref={svgRef}
            className="svg-host"
            width={viewWidth}
            height={viewHeight}
            viewBox={`0 0 ${viewWidth} ${viewHeight}`}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{ touchAction: 'none' }}
          >
            {walls.map((wall) => {
              const start = dragging?.entityId === wall.id && dragging.vertex === 'start' && dragPoint ? dragPoint : wall.start;
              const end = dragging?.entityId === wall.id && dragging.vertex === 'end' && dragPoint ? dragPoint : wall.end;
              const sp = toPx(start);
              const ep = toPx(end);
              const rejected = wall.confidence.validationStatus === 'user-rejected';
              return (
                <g key={wall.id} onClick={() => setSelectedId(wall.id)}>
                  <line
                    x1={sp.x}
                    y1={sp.y}
                    x2={ep.x}
                    y2={ep.y}
                    stroke={rejected ? '#f87171' : selectedId === wall.id ? '#38bdf8' : '#1f2937'}
                    strokeDasharray={rejected ? '4 3' : undefined}
                    strokeWidth={Math.max(2, wall.thicknessM * transform.scale)}
                  />
                  <circle cx={sp.x} cy={sp.y} r={6} fill="#38bdf8" onPointerDown={handlePointerDown(wall.id, 'start')} />
                  <circle cx={ep.x} cy={ep.y} r={6} fill="#38bdf8" onPointerDown={handlePointerDown(wall.id, 'end')} />
                </g>
              );
            })}
          </svg>
          <p className="muted">Drag a blue handle to move a wall endpoint. Click a wall to select it, then accept/reject.</p>
        </>
      )}
    </div>
  );
}
