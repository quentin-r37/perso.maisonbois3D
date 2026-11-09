import { describe, expect, it } from 'vitest';
import type { PieceSpec } from '../build/grid';
import { buildIndex, specKey, validate } from '../build/snap';
import { MODELS } from '../guide/models';
import { MAX_STEP, generateSteps } from './steps';

/** Deterministic shuffle: a free build is made in any order. */
function shuffled<T>(list: T[], seed: number): T[] {
  const out = [...list];
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe.each(MODELS.map((m) => [m.id, m] as const))('booklet of %s', (_id, model) => {
  const pieces = model.steps.flatMap((s) => s.pieces);
  const steps = generateSteps(shuffled(pieces, 7));

  it('uses every piece exactly once', () => {
    const keys = steps.flatMap((s) => s.pieces.map(specKey));
    expect(keys.length).toBe(pieces.length);
    expect(new Set(keys)).toEqual(new Set(pieces.map(specKey)));
  });

  it('can be built step by step', () => {
    const placed: PieceSpec[] = [];
    for (const step of steps) {
      for (const p of step.pieces) {
        const v = validate(p, placed, buildIndex(placed));
        expect(v.ok, `${step.title} ${specKey(p)} : ${v.reason}`).toBe(true);
        placed.push(p);
      }
    }
  });

  it('keeps the steps small', () => {
    for (const s of steps) {
      expect(s.pieces.length).toBeGreaterThan(0);
      expect(s.pieces.length).toBeLessThanOrEqual(MAX_STEP);
    }
  });

  it('does not depend on the order the pieces were placed in', () => {
    const other = generateSteps(shuffled(pieces, 99));
    expect(other.map((s) => [s.title, s.pieces.map(specKey)])).toEqual(steps.map((s) => [s.title, s.pieces.map(specKey)]));
  });
});

describe('generateSteps', () => {
  it('gives no step for an empty table', () => {
    expect(generateSteps([])).toEqual([]);
  });

  it('still lists pieces the rules cannot place', () => {
    const orphan: PieceSpec = { type: 'roof-plank', ix: 0, iz: 0, y: 8, axis: 'x', side: 1, slot: 0, param: 5, param2: 5 };
    const steps = generateSteps([orphan]);
    expect(steps.flatMap((s) => s.pieces)).toEqual([orphan]);
  });
});
