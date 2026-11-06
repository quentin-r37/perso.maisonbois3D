import { getDef } from '../pieces/catalog';
import { G, LOG_W, type Axis, type PieceSpec, type Side } from './grid';

/** Roof slope (~37°, measured on the real gables). */
export const SLOPE = 0.75;
export const SLOPE_ANGLE = Math.atan(SLOPE);
/** Width of the gable beyond the end notches (world): the base is as long as a medium log. */
export const GABLE_C = 0.55;
/** The gables are as thick as the logs. */
export const GABLE_T = LOG_W;
/** Roof plank: fixed width (world), fixed thickness. */
export const PLANK_W = 1.4;
/**
 * Positions along the ridge (ridge caps, chimney) are counted in half-plates.
 * Long ridge cap = 2 plates, short = 1 plate: they stop on the plate joints.
 */
export const RIDGE_DIV = 2;
export const PLANK_T = 0.14;
/** Plank overhang below the gable edge, along the slope. */
export const EAVE = 0.45;
/** Overhang of the roof beyond each gable (world) used to compute the number of planks. */
export const ROOF_OV = 0.6;

/**
 * Beams (battens): orange, square section as thick as the logs. They sit in notches
 * cut perpendicular to the slope (so they are tilted with the roof), 2 per slope,
 * and stick out of the gable edge by BEAM_OUT: the grooves under the planks fit over them.
 */
export const BATTEN = LOG_W;
/** Protrusion of the beams above the gable edge (perpendicular to the slope). */
export const BEAM_OUT = 0.07;
/** Depth of the notches in the gables. */
export const BATTEN_NOTCH = BATTEN - BEAM_OUT;
/**
 * The roof plates have two grooves underneath, across their width, that fit over the beams:
 * they lie directly on the gable edge.
 */
export const ROOF_LIFT = 0;
export const PLANK_GROOVE = BEAM_OUT + 0.005;
/** Position of the center of the notches along the slope (0 = eave, 1 = ridge). */
export const BATTEN_F = [0.4, 0.76];
/** Fixed length of the beams (world): they stick out just past the gables (5 G + one thickness). */
export const BATTEN_LEN = 3.62;
/** How far the beams stick out beyond the axis of the gables (world, total). */
export const BATTEN_EXTRA = BATTEN_LEN - 5 * G;

/** World length of a beam spanning gables D steps apart. */
export function battenLength(D: number) {
  return D * G + BATTEN_EXTRA;
}

/** Center (local gable coordinates) and tilt of beam `slot` on slope `side`. */
export function battenPose(W: number, side: number, slot: number): { x: number; y: number; rotZ: number } {
  const sx = side < 0 ? -1 : 1;
  const [lx, ly] = slopePoint(W, BATTEN_F[slot] ?? 0.5);
  const x = sx < 0 ? lx : W * G - lx;
  const off = BATTEN / 2 - BATTEN_NOTCH; // from the edge, along the outward normal
  const sa = Math.sin(SLOPE_ANGLE);
  const ca = Math.cos(SLOPE_ANGLE);
  return { x: x + sx * sa * off, y: ly + ca * off, rotZ: -sx * SLOPE_ANGLE };
}

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
      return start + ((slot + def.length / 2) * PLANK_W) / RIDGE_DIV;
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
