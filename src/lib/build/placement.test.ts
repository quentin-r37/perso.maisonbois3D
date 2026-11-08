import { describe, expect, it } from 'vitest';
import { G, Q, type PieceSpec } from './grid';
import { buildIndex, dropHeight } from './snap';
import { findRoofs } from './roof';
import { SNAP_RADIUS, candidateFromHit, evaluate, resolveAim, snapToLock, type BuildView, type Hit } from './placement';
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

describe('parallax', () => {
  // 5-wide room, side walls 5 logs high: a floor laid on top rests 2 world units up
  const walls: PieceSpec[] = [];
  for (let k = 0; k < 5; k++)
    for (const ix of [0, 5]) walls.push({ type: 'long', ix, iz: 0, y: 4 * k, axis: 'z' });
  const room = viewOf(walls);
  const target: PieceSpec = { type: 'floor', ix: 0, iz: 0, y: 0, axis: 'x', side: 1 };
  target.y = dropHeight(room.index, target);
  const [cx, cz] = boxesCenter(target);
  const top = target.y * Q;
  // seen from the front, looking down at 45°: the ray crosses the floor's plane at its
  // center, then goes on to hit the table 2 units further back
  const origin = { x: cx, y: top + 4, z: cz - 4 };
  const dir = { x: 0, y: -Math.SQRT1_2, z: Math.SQRT1_2 };
  const ground = { x: cx, y: 0, z: cz + top };

  it('a floor goes where it is seen under the cursor, not where the ray hits the table', () => {
    expect(top).toBeGreaterThan(3 * G);
    const hit: Hit = { kind: 'ground', point: ground, ray: { origin, dir } };
    const spec = candidateFromHit('floor', 0, hit, room)!;
    expect([spec.ix, spec.iz, spec.y]).toEqual([0, 0, target.y]);
    expect(evaluate(spec, room).ok).toBe(true);
  });

  it('without the ray (old behavior), it lands steps too far back', () => {
    const spec = candidateFromHit('floor', 0, { kind: 'ground', point: ground }, room)!;
    expect(spec.iz).toBeGreaterThan(1);
  });

  it('a log on the table keeps the hit point', () => {
    const p = { x: 10 * G, y: 0, z: 10 * G };
    const hit: Hit = { kind: 'ground', point: p, ray: { origin: { x: p.x, y: 4, z: p.z - 4 }, dir } };
    expect(resolveAim('medium', 0, hit, room)).toEqual([p.x, p.z]);
  });
});
