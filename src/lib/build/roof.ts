import { getDef } from '../pieces/catalog';
import { G, type Axis, type PieceSpec, type Side } from './grid';

/** Roof slope: 45°, the red ridge cap is a right angle. */
export const SLOPE = 1;
export const SLOPE_ANGLE = Math.atan(SLOPE);
/** Width of the gable beyond the end notches (world). */
export const GABLE_C = 0.6;
export const GABLE_T = 0.14;
/** Roof plank: fixed width (world), fixed thickness. */
export const PLANK_W = 0.9;
export const PLANK_T = 0.1;
/** Plank overhang below the gable edge, along the slope. */
export const EAVE = 0.45;
/** Overhang of the roof beyond each gable (world) used to compute the number of planks. */
export const ROOF_OV = 0.6;

/** Battens: light square slats that sit in the gable notches, the planks rest on them. */
export const BATTEN = 0.16;
export const BATTEN_NOTCH = 0.09;
export const ROOF_LIFT = BATTEN - BATTEN_NOTCH;
/** Notch positions along the slope (0 = eave, 1 = ridge): 2 per slope, 4 battens in total. */
export const BATTEN_F = [0.3, 0.76];
/** Fixed length of the battens (world). */
export const BATTEN_LEN = 4.8;

/** Gable height (world) for a width W in G. */
export function gableHeight(W: number) {
  return ((W * G) / 2 + GABLE_C) * SLOPE;
}

/** Number of planks per slope for a distance D (in G) between the gables. */
export function plankCount(D: number) {
  return Math.max(1, Math.round((D * G + 2 * ROOF_OV) / PLANK_W));
}

/** A roof = a pair of parallel gables that are aligned, the same size and at the same height. */
export interface Roof {
  key: string;
  axis: Axis;
  /** Grid origin of the first gable (ix, iz). */
  ix: number;
  iz: number;
  y: number;
  /** Gable width (G). */
  W: number;
  /** Distance between the gables (G). */
  D: number;
  /** Perpendicular grid coordinate (iz for axis x, ix for axis z) of the 1st gable. */
  perp0: number;
  /** Planks per slope. */
  n: number;
  /** World perpendicular coordinate of the start of the roof. */
  start: number;
}

const along = (p: PieceSpec) => (p.axis === 'x' ? p.ix : p.iz);
const perpCoord = (p: PieceSpec) => (p.axis === 'x' ? p.iz : p.ix);

export function roofStart(perp0: number, D: number) {
  return (perp0 + D / 2) * G - (plankCount(D) * PLANK_W) / 2;
}

export function findRoofs(pieces: readonly PieceSpec[]): Roof[] {
  const gables = pieces.filter((p) => getDef(p.type).kind === 'gable');
  const roofs: Roof[] = [];
  for (const g of gables) {
    const W = getDef(g.type).length;
    let best: PieceSpec | null = null;
    for (const o of gables) {
      if (o === g || o.axis !== g.axis || o.y !== g.y || along(o) !== along(g)) continue;
      if (getDef(o.type).length !== W) continue;
      const d = perpCoord(o) - perpCoord(g);
      if (d < 2) continue;
      if (!best || d < perpCoord(best) - perpCoord(g)) best = o;
    }
    if (!best) continue;
    const D = perpCoord(best) - perpCoord(g);
    const perp0 = perpCoord(g);
    roofs.push({
      key: roofKey(g.axis, g.ix, g.iz, g.y, W, D),
      axis: g.axis,
      ix: g.ix,
      iz: g.iz,
      y: g.y,
      W,
      D,
      perp0,
      n: plankCount(D),
      start: roofStart(perp0, D)
    });
  }
  return roofs;
}

export function roofKey(axis: Axis, ix: number, iz: number, y: number, W: number, D: number) {
  return `${axis}:${ix}:${iz}:${y}:${W}:${D}`;
}

export function roofOfPiece(p: PieceSpec): string {
  return roofKey(p.axis, p.ix, p.iz, p.y, p.param ?? 0, p.param2 ?? 0);
}

/** Builds the spec of a roof piece on a given roof. */
export function roofSpec(type: string, roof: Roof, side: Side, slot: number): PieceSpec {
  const kind = getDef(type).kind;
  return {
    type,
    ix: roof.ix,
    iz: roof.iz,
    y: roof.y,
    axis: roof.axis,
    side: kind === 'ridge' || kind === 'chimney' ? 1 : side,
    slot,
    param: roof.W,
    param2: roof.D
  };
}

/** World perpendicular coordinate of the center of a roof piece. */
export function roofPieceCenter(spec: PieceSpec): number {
  const def = getDef(spec.type);
  const D = spec.param2 ?? 0;
  const perp0 = spec.axis === 'x' ? spec.iz : spec.ix;
  const start = roofStart(perp0, D);
  const n = plankCount(D);
  const slot = spec.slot ?? 0;
  switch (def.kind) {
    case 'roof':
      return start + (slot + 0.5) * PLANK_W;
    case 'ridge':
    case 'chimney':
      return start + ((slot + def.length / 2) * PLANK_W) / 4;
    default:
      return start + (n * PLANK_W) / 2;
  }
}

/** Does this gable carry a roof that has pieces on it? */
export function gableUsedByRoof(g: PieceSpec, pieces: readonly PieceSpec[]): boolean {
  const W = getDef(g.type).length;
  return pieces.some((p) => {
    const k = getDef(p.type).kind;
    if (k !== 'roof' && k !== 'ridge' && k !== 'chimney' && k !== 'batten') return false;
    if (p.axis !== g.axis || p.y !== g.y || p.param !== W) return false;
    if (along(p) !== along(g)) return false;
    const p0 = perpCoord(p);
    return p0 === perpCoord(g) || p0 + (p.param2 ?? 0) === perpCoord(g);
  });
}

/** Point on the left slope edge of the gable (world, f = 0 at the eave, 1 at the ridge). */
export function slopePoint(W: number, f: number): [number, number] {
  const run = (W * G) / 2 + GABLE_C;
  return [-GABLE_C + f * run, f * gableHeight(W)];
}

/** Index of the batten closest to local position x (world, 0..W·G) along the gable. */
export function nearestBatten(W: number, x: number): number {
  const Ww = W * G;
  const run = Ww / 2 + GABLE_C;
  const f = (Math.min(x, Ww - x) + GABLE_C) / run;
  let best = 0;
  for (let i = 1; i < BATTEN_F.length; i++)
    if (Math.abs(BATTEN_F[i] - f) < Math.abs(BATTEN_F[best] - f)) best = i;
  return best;
}
