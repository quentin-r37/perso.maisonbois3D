import { describe, expect, it } from 'vitest';
import type { PieceSpec } from './grid';
import { buildIndex, canRemove, dropHeight, pointsOf, specKey, validate } from './snap';
import { findRoofs, roofSpec } from './roof';
import { CATALOG } from '../pieces/catalog';

const drop = (pieces: PieceSpec[], spec: Omit<PieceSpec, 'y'>) =>
  dropHeight(buildIndex(pieces), { ...spec, y: 0 });

describe('piece catalogue', () => {
  it('only three kinds of logs: small, medium, long', () => {
    expect(CATALOG.filter((d) => d.kind === 'log').map((d) => d.id)).toEqual(['small', 'medium', 'long']);
  });

  it('the long log is not two mediums: its middle notch is off-center', () => {
    const long = CATALOG.find((d) => d.id === 'long')!;
    const medium = CATALOG.find((d) => d.id === 'medium')!;
    expect(long.length).not.toBe(2 * medium.length);
    expect(long.notches).toEqual([0, 3, 8]);
    // flipped, the middle notch moves to the other side
    const flipped = pointsOf({ type: 'long', ix: 0, iz: 0, y: 0, axis: 'x', side: -1 }).filter((o) => o.notch);
    expect(flipped.map((o) => o.x)).toEqual([0, 5, 8]);
  });
});

describe('stacking solver', () => {
  it('a log on the table rests at 0', () => {
    expect(drop([], { type: 'medium', ix: 0, iz: 0, axis: 'x' })).toBe(0);
  });

  it('two parallel logs stack (+4 Q)', () => {
    const a: PieceSpec = { type: 'medium', ix: 0, iz: 0, y: 0, axis: 'x' };
    expect(drop([a], { type: 'medium', ix: 0, iz: 0, axis: 'x' })).toBe(4);
  });

  it('two logs crossed at their notches fit into each other (+2 Q)', () => {
    const a: PieceSpec = { type: 'medium', ix: 0, iz: 0, y: 0, axis: 'x' };
    expect(drop([a], { type: 'medium', ix: 0, iz: 0, axis: 'z' })).toBe(2);
  });

  it('crossed away from a notch of the lower log, only its own notch sinks in (+3 Q)', () => {
    const a: PieceSpec = { type: 'medium', ix: 0, iz: 0, y: 0, axis: 'x' };
    expect(drop([a], { type: 'medium', ix: 2, iz: 0, axis: 'z' })).toBe(3);
  });

  it('the heads of a log are solid: they rest on what is under them', () => {
    // Z wall on the table, small log just next to it: its head lands on the wall
    const wall: PieceSpec = { type: 'medium', ix: 0, iz: 0, y: 0, axis: 'z' };
    expect(drop([wall], { type: 'small', ix: 1, iz: 2, axis: 'x' })).toBe(4);
  });

  it('a piece held up by a single head tips over: placement refused', () => {
    const wall: PieceSpec = { type: 'medium', ix: 0, iz: 0, y: 0, axis: 'z' };
    const pieces = [wall];
    const idx = buildIndex(pieces);
    const spec: PieceSpec = { type: 'small', ix: 1, iz: 2, y: 0, axis: 'x' };
    spec.y = dropHeight(idx, spec);
    expect(validate(spec, pieces, idx).ok).toBe(false);
  });

  it('a log resting on two walls is stable', () => {
    const pieces: PieceSpec[] = [
      { type: 'medium', ix: 0, iz: 0, y: 0, axis: 'x' },
      { type: 'medium', ix: 0, iz: 5, y: 0, axis: 'x' }
    ];
    const idx = buildIndex(pieces);
    const spec: PieceSpec = { type: 'medium', ix: 0, iz: 0, y: 2, axis: 'z' };
    expect(validate(spec, pieces, idx).ok).toBe(true);
  });

  it('the middle notch of the long log accepts a crossing log', () => {
    const a: PieceSpec = { type: 'long', ix: 0, iz: 0, y: 0, axis: 'x', side: 1 };
    expect(drop([a], { type: 'medium', ix: 3, iz: 0, axis: 'z' })).toBe(2);
    expect(drop([a], { type: 'medium', ix: 5, iz: 0, axis: 'z' })).toBe(3);
  });

  it('a square of 4 medium walls closes up evenly', () => {
    const pieces: PieceSpec[] = [];
    const place = (spec: Omit<PieceSpec, 'y'>) => {
      const y = drop(pieces, spec);
      pieces.push({ ...spec, y });
      return y;
    };
    expect(place({ type: 'medium', ix: 0, iz: 0, axis: 'x' })).toBe(0);
    expect(place({ type: 'medium', ix: 0, iz: 5, axis: 'x' })).toBe(0);
    for (let c = 0; c < 3; c++) {
      expect(place({ type: 'medium', ix: 0, iz: 0, axis: 'z' })).toBe(2 + 4 * c);
      expect(place({ type: 'medium', ix: 5, iz: 0, axis: 'z' })).toBe(2 + 4 * c);
      expect(place({ type: 'medium', ix: 0, iz: 0, axis: 'x' })).toBe(4 + 4 * c);
      expect(place({ type: 'medium', ix: 0, iz: 5, axis: 'x' })).toBe(4 + 4 * c);
    }
  });

  it('small logs crossing at the corners frame an opening', () => {
    const pieces: PieceSpec[] = [
      { type: 'medium', ix: 0, iz: 0, y: 2, axis: 'z' },
      { type: 'medium', ix: 5, iz: 0, y: 2, axis: 'z' }
    ];
    expect(drop(pieces, { type: 'small', ix: 0, iz: 0, axis: 'x' })).toBe(4);
    expect(drop(pieces, { type: 'small', ix: 5, iz: 0, axis: 'x' })).toBe(4);
  });

  it('rejects an incorrect height', () => {
    const pieces: PieceSpec[] = [{ type: 'medium', ix: 0, iz: 0, y: 0, axis: 'x' }];
    const v = validate({ type: 'medium', ix: 0, iz: 0, y: 0, axis: 'x' }, pieces, buildIndex(pieces));
    expect(v.ok).toBe(false);
  });

  it('cannot remove a piece that has another resting on it', () => {
    const a = { uid: 1, type: 'medium', ix: 0, iz: 0, y: 0, axis: 'x' as const };
    const b = { uid: 2, type: 'medium', ix: 0, iz: 0, y: 2, axis: 'z' as const };
    const pieces = [a, b];
    const idx = buildIndex(pieces);
    expect(canRemove(a, pieces, idx).ok).toBe(false);
    expect(canRemove(b, pieces, idx).ok).toBe(true);
  });
});

describe('roof', () => {
  const g: PieceSpec[] = [
    { type: 'gable', ix: 0, iz: 0, y: 8, axis: 'x' },
    { type: 'gable', ix: 0, iz: 5, y: 8, axis: 'x' }
  ];

  it('two facing gables form a roof', () => {
    const roofs = findRoofs(g);
    expect(roofs).toHaveLength(1);
    expect(roofs[0].D).toBe(5);
    expect(roofs[0].n).toBeGreaterThan(2);
  });

  it('the planks need their battens', () => {
    const roofs = findRoofs(g);
    const plank = roofSpec('roof-plank', roofs[0], 1, 0);
    expect(validate(plank, g, buildIndex(g), roofs).ok).toBe(false);
    const battens = [0, 1].map((i) => roofSpec('batten', roofs[0], 1, i));
    const withBattens = [...g, ...battens];
    expect(validate(plank, withBattens, buildIndex(withBattens)).ok).toBe(true);
    const both = [...withBattens, plank];
    expect(validate(plank, both, buildIndex(both)).ok).toBe(false);
    const other = roofSpec('roof-plank', roofs[0], -1, 0);
    expect(validate(other, both, buildIndex(both)).ok).toBe(false);
  });

  it('ridge caps must not overlap', () => {
    const roofs = findRoofs(g);
    const battens = [1, -1].flatMap((s) => [0, 1].map((i) => roofSpec('batten', roofs[0], s as 1 | -1, i)));
    const base = [...g, ...battens];
    const long = roofSpec('ridge-long', roofs[0], 1, 0);
    expect(validate(long, base, buildIndex(base)).ok).toBe(true);
    const withLong = [...base, long];
    expect(validate(roofSpec('ridge-short', roofs[0], 1, 6), withLong, buildIndex(withLong)).ok).toBe(false);
    expect(validate(roofSpec('ridge-short', roofs[0], 1, 12), withLong, buildIndex(withLong)).ok).toBe(true);
  });
});

it('specKey ignores fields that do not apply', () => {
  expect(specKey({ type: 'medium', ix: 0, iz: 0, y: 0, axis: 'x', side: -1 })).toBe(
    specKey({ type: 'medium', ix: 0, iz: 0, y: 0, axis: 'x' })
  );
});
