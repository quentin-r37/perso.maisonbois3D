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

describe('crenels', () => {
  /** Two crenel logs facing each other, 5 G apart (front and back of a tower). */
  const crenels: PieceSpec[] = [
    { type: 'crenel', ix: 0, iz: 0, y: 0, axis: 'x' },
    { type: 'crenel', ix: 0, iz: 5, y: 0, axis: 'x' }
  ];
  const cv = viewOf(crenels);

  it('a medium log laid across is pulled into the crenels and locks at both ends', () => {
    for (const ix of [1, 2, 4]) {
      const cand: PieceSpec = { type: 'medium', ix, iz: 0, y: 0, axis: 'z' };
      cand.y = dropHeight(cv.index, cand);
      // on the grid it lands on the edge of a crenel: refused or loose, never locked
      const g = evaluate(cand, cv);
      expect(!g.ok || g.loose).toBe(true);
      const snapped = snapToLock(cand, boxesCenter(cand), cv);
      expect(snapped?.locks).toHaveLength(2);
      expect(snapped?.spec.y).toBe(2);
      expect([1.25, 2.5, 3.75]).toContain(snapped?.spec.ix);
    }
  });

  it('upside down, a crenel log caps the logs laid across and rests on the crenel log below', () => {
    const across = [1.25, 2.5, 3.75].map((ix): PieceSpec => ({ type: 'medium', ix, iz: 0, y: 2, axis: 'z' }));
    const v = viewOf([...crenels, ...across]);
    const cap: PieceSpec = { type: 'crenel', ix: 0, iz: 0, y: 0, axis: 'x', side: -1 };
    cap.y = dropHeight(v.index, cap);
    expect(cap.y).toBe(4);
    const g = evaluate(cap, v);
    expect(g.ok).toBe(true);
    expect(g.locks).toHaveLength(3);
    // right way up it would sit on the logs laid across
    const flat: PieceSpec = { ...cap, side: 1 };
    expect(dropHeight(v.index, flat)).toBe(5);
  });

  it('it is caught when pointed near one end, not only in the middle', () => {
    const cand: PieceSpec = { type: 'medium', ix: 2, iz: 0, y: 0, axis: 'z' };
    cand.y = dropHeight(cv.index, cand);
    // pointing just inside the front crenel log, over the middle crenel
    const snapped = snapToLock(cand, [2.5 * G, 0.4], cv);
    expect(snapped?.spec).toMatchObject({ ix: 2.5, iz: 0, y: 2 });
  });
});

describe('castle decor', () => {
  const at = (x: number, z: number): Hit => ({ kind: 'ground', point: { x, y: 0, z } });

  it('the flag stands with its foot under the cursor, on the table', () => {
    for (const rot of [0, 1, 2, 3]) {
      const s = candidateFromHit('flag', rot, at(2 * G, 3 * G), viewOf([]))!;
      expect([s.ix, s.iz, s.y]).toEqual([2, 3, 0]);
      expect(evaluate(s, viewOf([])).ok).toBe(true);
    }
  });

  it('the flag stands inside a tower, its cloth flying over the walls around it', () => {
    // a 5 × 5 tower, 6 courses high
    const pieces: PieceSpec[] = [];
    for (let c = 0; c < 6; c++) {
      const y = c * 2 * 2;
      if (c % 2 === 0) pieces.push({ type: 'medium', ix: 0, iz: 0, y, axis: 'x' }, { type: 'medium', ix: 0, iz: 5, y, axis: 'x' });
      else pieces.push({ type: 'medium', ix: 0, iz: 0, y, axis: 'z' }, { type: 'medium', ix: 5, iz: 0, y, axis: 'z' });
    }
    const v = viewOf(pieces);
    for (const rot of [0, 1, 2, 3]) {
      const s = candidateFromHit('flag', rot, at(4 * G, 2 * G), v)!;
      expect([s.ix, s.iz, s.y]).toEqual([4, 2, 0]);
      expect(evaluate(s, v).ok).toBe(true);
    }
  });

  it('the knights stand on the table, sword or axe at their side', () => {
    for (const type of ['knight', 'knight-crown'])
      for (const rot of [0, 1, 2, 3]) {
        const s = candidateFromHit(type, rot, at(0, 0), viewOf([]))!;
        expect([s.ix, s.iz, s.y].map((v) => v + 0)).toEqual([0, 0, 0]);
        expect(evaluate(s, viewOf([])).ok).toBe(true);
      }
  });
});
