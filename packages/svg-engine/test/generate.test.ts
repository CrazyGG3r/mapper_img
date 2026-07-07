import { describe, expect, it } from 'vitest';
import { createDefaultConfidenceMeta, type Room, type Wall } from '@topview/schema';
import { generateSvg } from '../src/generate.js';

const now = new Date().toISOString();

function wall(id: string, start: { x: number; y: number }, end: { x: number; y: number }): Wall {
  return {
    id,
    kind: 'wall',
    layerId: 'layer-default',
    start,
    end,
    thicknessM: 0.15,
    confidence: createDefaultConfidenceMeta(),
    createdAt: now,
    updatedAt: now,
  };
}

function room(id: string, boundary: { x: number; y: number }[], label?: string): Room {
  return {
    id,
    kind: 'room',
    layerId: 'layer-default',
    boundary,
    wallIds: [],
    label,
    confidence: createDefaultConfidenceMeta(),
    createdAt: now,
    updatedAt: now,
  };
}

describe('generateSvg', () => {
  it('produces a well-formed SVG document with a wall line and a room polygon', () => {
    const svg = generateSvg([
      wall('w1', { x: 0, y: 0 }, { x: 4, y: 0 }),
      room('r1', [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }], 'Living Room'),
    ]);

    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('<line id="w1"');
    expect(svg).toContain('<polygon id="r1"');
    expect(svg).toContain('Living Room');
    expect(svg).toContain('viewBox="0 0');
  });

  it('scales wall stroke-width with unitsPerMeter and wall thickness', () => {
    const svg = generateSvg([wall('w1', { x: 0, y: 0 }, { x: 1, y: 0 })], { unitsPerMeter: 200 });
    // thicknessM 0.15 * unitsPerMeter 200 = 30
    expect(svg).toContain('stroke-width="30"');
  });

  it('produces a valid non-degenerate viewBox even with no entities', () => {
    const svg = generateSvg([]);
    // default bounds fall back to a unit box; default 0.5m padding on each side
    // doubles both dimensions before scaling by the default 100 units/meter.
    expect(svg).toContain('viewBox="0 0 200 200"');
  });

  it('escapes room label text to avoid breaking the XML', () => {
    const svg = generateSvg([room('r1', [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], 'A & B <room>')]);
    expect(svg).toContain('A &amp; B &lt;room&gt;');
  });
});
