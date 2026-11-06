import { describe, expect, it } from 'vitest';
import type { PieceSpec } from '../../build/grid';
import { buildIndex, dropHeight, specKey, validate } from '../../build/snap';
import { MODELS } from './index';

describe.each(MODELS.map((m) => [m.id, m] as const))('model %s', (_id, model) => {
  it('every piece rests exactly at its declared height', () => {
    const placed: PieceSpec[] = [];
    for (const step of model.steps) {
      const prevIndex = buildIndex(placed);
      for (const p of step.pieces) {
        // independent of the order within the step
        const others = step.pieces.filter((o) => o !== p);
        const withOthers = buildIndex([...placed, ...others]);
        expect(dropHeight(prevIndex, p), `${step.title} ${specKey(p)}`).toBe(p.y);
        expect(dropHeight(withOthers, p), `${step.title} (order) ${specKey(p)}`).toBe(p.y);
      }
      for (const p of step.pieces) {
        const v = validate(p, placed, buildIndex(placed));
        expect(v.ok, `${step.title} ${specKey(p)} : ${v.reason}`).toBe(true);
        placed.push(p);
      }
    }
  });

  it('no duplicate pieces', () => {
    const keys = model.steps.flatMap((s) => s.pieces.map(specKey));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
