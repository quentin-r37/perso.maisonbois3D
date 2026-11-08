import { describe, expect, it } from 'vitest';
import { G, type PieceSpec } from './grid';
import { buildIndex, dropHeight } from './snap';
import { findRoofs } from './roof';
import { SNAP_RADIUS, evaluate, snapToLock, type BuildView } from './placement';
import { boxesCenter } from './transform';

const viewOf = (pieces: PieceSpec[]): BuildView => ({ pieces, index: buildIndex(pieces), roofs: findRoofs(pieces) });

/** First course: two X logs, 5 G apart (the notches of a Z log fall on them at ix = 0 and ix = 5). */
const course: PieceSpec[] = [
  { type: 'medium', ix: 0, iz: 0, y: 0, axis: 'x' },
  { type: 'medium', ix: 0, iz: 5, y: 0, axis: 'x' }
];
const view = viewOf(course);

function zLog(ix: number): PieceSpec {
  const s: PieceSpec = { type: 'medium', ix, iz: 0, y: 0, axis: 'z' };
  s.y = dropHeight(view.index, s);
  return s;
}

describe('notch affordance', () => {
  it('a log on the table is not "loose": the first course has nothing to lock into', () => {
    const g = evaluate({ type: 'medium', ix: 0, iz: 10, y: 0, axis: 'x' }, viewOf([]));
    expect(g.ok).toBe(true);
    expect(g.loose).toBe(false);
  });

  it('crossed one step away from the notches: allowed but loose', () => {
    const g = evaluate(zLog(1), view);
    expect(g.ok).toBe(true);
    expect(g.locks).toHaveLength(0);
    expect(g.loose).toBe(true);
  });

  it('crossed at the notches: locked, not loose', () => {
    const g = evaluate(zLog(0), view);
    expect(g.locks).toHaveLength(2);
    expect(g.loose).toBe(false);
  });

  it('the magnet pulls a loose log into the notches one step away', () => {
    const cand = zLog(1);
    const g = snapToLock(cand, boxesCenter(cand), view);
    expect(g?.spec).toMatchObject({ ix: 0, iz: 0, y: 2, axis: 'z' });
    expect(g?.locks).toHaveLength(2);
  });

  it('too far from any notch: no magnet, the piece stays under the cursor', () => {
    const cand = zLog(3);
    expect(snapToLock(cand, boxesCenter(cand), view)).toBeNull();
  });

  it('a spot already caught is kept a little longer (no flicker)', () => {
    const [cx, cz] = boxesCenter(zLog(0));
    // between the caught spot and the radius it lets go at
    const aim: [number, number] = [cx + SNAP_RADIUS + 0.1 * G, cz];
    const cand = zLog(Math.round((aim[0] - cx) / G));
    expect(snapToLock(cand, aim, view)).toBeNull();
    expect(snapToLock(cand, aim, view, zLog(0))?.spec).toMatchObject({ ix: 0, y: 2 });
  });

  it('pieces without notches are never pulled', () => {
    const floor: PieceSpec = { type: 'floor', ix: 0, iz: 0, y: 0, axis: 'x' };
    expect(snapToLock(floor, boxesCenter(floor), view)).toBeNull();
  });
});
