import { CATALOG, getDef } from '../../pieces/catalog';
import type { Axis, PieceSpec, Side } from '../../build/grid';
import { BATTEN_F, RIDGE_DIV, findRoofs, roofSpec, type Roof } from '../../build/roof';

export interface Step {
  title: string;
  hint?: string;
  pieces: PieceSpec[];
}

export interface Model {
  id: string;
  name: string;
  description: string;
  /** Difficulty, 1 (easy) to 3. */
  level: 1 | 2 | 3;
  /** Camera target (world). */
  center: [number, number, number];
  steps: Step[];
}

export interface Opening {
  type: 'door' | 'window';
  /** Start point of the opening along the wall (1 for a medium wall). */
  at: number;
  y: number;
  /** Outside face. */
  side?: Side;
}

export interface Wall {
  axis: Axis;
  /** Wall origin. */
  ix: number;
  iz: number;
  /** 5 (medium log) or 8 (long log). */
  length: 5 | 8;
  /** Long log: middle notch on the origin side (1) or the far side (-1). */
  longSide?: Side;
  openings?: Opening[];
}

function activeOpenings(wall: Wall, y: number): Opening[] {
  return (wall.openings ?? []).filter((o) => y < o.y + getDef(o.type).h && y + 4 > o.y);
}

/**
 * One course of a wall at height y.
 * - no opening: a single log the length of the wall (medium or long);
 * - opening: a small log at each end; its heads hold the frame
 *   (like the small stacked squares beside the windows of the real chalets).
 */
export function wallCourse(wall: Wall, y: number): PieceSpec[] {
  const [ax, az] = wall.axis === 'x' ? [1, 0] : [0, 1];
  const at = (k: number) => ({ ix: wall.ix + ax * k, iz: wall.iz + az * k });
  const open = activeOpenings(wall, y);
  if (open.length) {
    for (const o of open) {
      if (o.at !== 1 || o.at + getDef(o.type).length !== wall.length - 1)
        throw new Error('An opening must fill a medium wall between two small logs');
    }
    return [
      { type: 'small', ...at(0), y, axis: wall.axis },
      { type: 'small', ...at(wall.length), y, axis: wall.axis }
    ];
  }
  if (wall.length === 8) return [{ type: 'long', ...at(0), y, axis: wall.axis, side: wall.longSide ?? 1 }];
  return [{ type: 'medium', ...at(0), y, axis: wall.axis }];
}

export function openingSpec(wall: Wall, o: Opening): PieceSpec {
  const [ax, az] = wall.axis === 'x' ? [1, 0] : [0, 1];
  return {
    type: o.type,
    ix: wall.ix + ax * o.at,
    iz: wall.iz + az * o.at,
    y: o.y,
    axis: wall.axis,
    side: o.side ?? 1
  };
}

function roofOf(gables: PieceSpec[]): Roof {
  const roof = findRoofs(gables)[0];
  if (!roof) throw new Error('No roof for these gables');
  return roof;
}

/** All the planks of one slope. */
export function roofPieces(gables: PieceSpec[], side: Side): PieceSpec[] {
  const roof = roofOf(gables);
  const out: PieceSpec[] = [];
  for (let s = 0; s < roof.n; s++) out.push(roofSpec('roof-plank', roof, side, s));
  return out;
}

export function battenPieces(gables: PieceSpec[], side: Side): PieceSpec[] {
  const roof = roofOf(gables);
  // the beam whose length matches the distance between the gables
  const type = CATALOG.find((d) => d.kind === 'batten' && d.length === roof.D)?.id;
  if (!type) throw new Error(`No roof beam for gables ${roof.D} apart`);
  return BATTEN_F.map((_, i) => roofSpec(type, roof, side, i));
}

/** Ridge caps: long ones first, then a short one, centered on the roof. */
export function ridgePieces(gables: PieceSpec[]): PieceSpec[] {
  const roof = roofOf(gables);
  const total = roof.n * RIDGE_DIV;
  const L = getDef('ridge-long').length;
  const S = getDef('ridge-short').length;
  const types: string[] = [];
  let used = 0;
  while (used + L <= total) {
    types.push('ridge-long');
    used += L;
  }
  if (used + S <= total) {
    types.push('ridge-short');
    used += S;
  }
  let q = Math.floor((total - used) / 2);
  return types.map((t) => {
    const spec = roofSpec(t, roof, 1, q);
    q += getDef(t).length;
    return spec;
  });
}

/** Chimney astride the ridge, at a position in half-plates. */
export function chimneyPiece(gables: PieceSpec[], half: number): PieceSpec {
  return roofSpec('chimney', roofOf(gables), 1, half);
}
