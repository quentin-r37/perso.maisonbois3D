import { getDef, isRoofKind } from '../pieces/catalog';
import { FLOOR_MARGIN, G, LOG_W, OVERHANG, Q, floorNotchZ, halfFloorEndZ, type PieceSpec } from './grid';
import { GABLE_C, GABLE_T, gableHeight } from './roof';

/**
 * A piece is described by a set of boxes aligned with the grid:
 * x/z in world units, y in quarters (Q) relative to the base of the piece.
 * The notches are boxes that are thinner in height (`notch` = true).
 */
export interface LocalBox {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
  notch?: boolean;
}

export interface WorldBox extends LocalBox {
  piece: PieceSpec;
}

/** The heads of the small logs on either side of an opening stop here (local coord of the opening). */
export const FRAME_X0 = OVERHANG - G;

const W2 = LOG_W / 2;

function logBoxes(notches: number[], h: number, top: number, bottom: number): LocalBox[] {
  const xs = [...notches].sort((a, b) => a - b).map((k) => k * G);
  const out: LocalBox[] = [];
  const full = (x0: number, x1: number) => out.push({ x0, x1, z0: -W2, z1: W2, y0: 0, y1: h });
  full(xs[0] - OVERHANG, xs[0] - W2);
  xs.forEach((x, i) => {
    out.push({ x0: x - W2, x1: x + W2, z0: -W2, z1: W2, y0: bottom, y1: h - top, notch: true });
    if (i < xs.length - 1) full(x + W2, xs[i + 1] - W2);
  });
  full(xs[xs.length - 1] + W2, xs[xs.length - 1] + OVERHANG);
  return out;
}

/**
 * Crenels of a crenel log, as [x0, x1] spans (local x, world units): standard notches
 * (as wide as a log), cut in the top only, evenly spaced between two corner notches
 * (three on a medium log, at a quarter, half and three quarters).
 */
export function crenelSpans(notches: number[]): [number, number][] {
  const xs = [...notches].sort((a, b) => a - b).map((k) => k * G);
  const out: [number, number][] = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const n = Math.max(2, Math.round((xs[i + 1] - xs[i]) / (1.25 * G)));
    for (let k = 1; k < n; k++) {
      const x = xs[i] + ((xs[i + 1] - xs[i]) * k) / n;
      out.push([x - W2, x + W2]);
    }
  }
  return out;
}

/** Plain log boxes, with the full sections lowered by `depth` over the crenels (notches cut in the top). */
function crenelBoxes(notches: number[], h: number, depth: number, top: number, bottom: number): LocalBox[] {
  const gaps = crenelSpans(notches);
  const out: LocalBox[] = [];
  for (const b of logBoxes(notches, h, top, bottom)) {
    if (b.notch) {
      out.push(b);
      continue;
    }
    let x = b.x0;
    for (const [g0, g1] of gaps) {
      if (g1 <= b.x0 || g0 >= b.x1) continue;
      if (g0 > x) out.push({ ...b, x0: x, x1: g0 });
      out.push({ ...b, x0: g0, x1: g1, y1: h - depth, notch: true });
      x = g1;
    }
    if (x < b.x1) out.push({ ...b, x0: x, x1: b.x1 });
  }
  return out;
}

/** Cut log: head and notch at the corner, then the log runs on to its sawn end at `cut`. */
function cutLogBoxes(cut: number, h: number, top: number, bottom: number): LocalBox[] {
  return [
    { x0: -OVERHANG, x1: -W2, z0: -W2, z1: W2, y0: 0, y1: h },
    { x0: -W2, x1: W2, z0: -W2, z1: W2, y0: bottom, y1: h - top, notch: true },
    { x0: W2, x1: cut, z0: -W2, z1: W2, y0: 0, y1: h }
  ];
}

function gableBoxes(W: number): LocalBox[] {
  const Ww = W * G;
  const t = GABLE_T / 2;
  const out: LocalBox[] = [];
  const seg = (x0: number, x1: number, y0: number, notch = false) =>
    out.push({ x0, x1, z0: -t, z1: t, y0, y1: 4, notch });
  // base: notched at the corners to fit over the logs of the side walls
  seg(-GABLE_C, -W2, 0);
  seg(-W2, W2, 1, true);
  seg(W2, Ww - W2, 0);
  seg(Ww - W2, Ww + W2, 1, true);
  seg(Ww + W2, Ww + GABLE_C, 0);
  // the triangle (approximated)
  out.push({ x0: Ww * 0.25, x1: Ww * 0.75, z0: -t, z1: t, y0: 4, y1: 4 + Math.round(gableHeight(W) / 2 / Q) });
  return out;
}

const localCache = new Map<string, LocalBox[]>();

/** A crenel log turned upside down (facing -1): its crenels open underneath. */
export function isUpsideDown(spec: Pick<PieceSpec, 'type' | 'side'>): boolean {
  return !!getDef(spec.type).teeth && spec.side === -1;
}

/** Boxes of a piece type in its local frame (along +X, centered in Z), upside down if asked. */
export function localBoxes(type: string, upside = false): LocalBox[] {
  const key = upside ? `${type}:upside` : type;
  let b = localCache.get(key);
  if (b) return b;
  const def = getDef(type);
  if (upside) {
    b = localBoxes(type).map((o) => ({ ...o, y0: def.h - o.y1, y1: def.h - o.y0 }));
    localCache.set(key, b);
    return b;
  }
  switch (def.kind) {
    case 'log':
      if (def.cut !== undefined) b = cutLogBoxes(def.cut, def.h, def.topNotch, def.bottomNotch);
      else if (def.teeth) b = crenelBoxes(def.notches ?? [0], def.h, def.teeth, def.topNotch, def.bottomNotch);
      else b = logBoxes(def.notches ?? [0], def.h, def.topNotch, def.bottomNotch);
      break;
    case 'insert':
      b = [{ x0: FRAME_X0 + 0.01, x1: def.length * G - FRAME_X0 - 0.01, z0: -W2, z1: W2, y0: 0, y1: def.h }];
      break;
    case 'gable':
      b = gableBoxes(def.length);
      break;
    case 'floor': {
      // board minus its back-corner notches, so it can slide under the heads of the corner logs;
      // its front edge stops against the front log (it sits inside the frame, not on top of it)
      const L = def.length * G;
      const m = FLOOR_MARGIN;
      if (type === 'floor-half') {
        // notched front corners (around the heads of the corner logs), ends in the middle of the room
        b = [
          { x0: W2, x1: L - W2, z0: W2, z1: OVERHANG, y0: 0, y1: def.h },
          { x0: -m, x1: L + m, z0: OVERHANG, z1: halfFloorEndZ(def.depth), y0: 0, y1: def.h }
        ];
        break;
      }
      const zn = floorNotchZ(def.depth);
      b = [
        { x0: -m, x1: L + m, z0: W2, z1: zn, y0: 0, y1: def.h },
        { x0: W2, x1: L - W2, z0: zn, z1: def.depth * G + m, y0: 0, y1: def.h }
      ];
      break;
    }
    case 'decor':
      b =
        type === 'tree'
          ? [{ x0: -0.5, x1: 0.5, z0: -0.08, z1: 0.08, y0: 0, y1: def.h }]
          : [{ x0: -0.2, x1: 0.2, z0: -0.13, z1: 0.13, y0: 0, y1: def.h }];
      break;
    default:
      b = [];
  }
  localCache.set(type, b);
  return b;
}

/** Boxes of a piece in the world (x/z world units, y in absolute Q). */
export function worldBoxes(spec: PieceSpec): WorldBox[] {
  const def = getDef(spec.type);
  if (isRoofKind(def.kind)) return [];
  const ox = spec.ix * G;
  const oz = spec.iz * G;
  const L = def.length * G;
  const D = def.depth * G;
  const flip = def.rotations === 4 && spec.side === -1;
  return localBoxes(spec.type, isUpsideDown(spec)).map((b) => {
    // facing -1: rotated 180° around the center of the piece
    let lx0 = b.x0;
    let lx1 = b.x1;
    let lz0 = b.z0;
    let lz1 = b.z1;
    if (flip) {
      [lx0, lx1] = [L - b.x1, L - b.x0];
      [lz0, lz1] = [D - b.z1, D - b.z0];
    }
    // axis z: local x → +z, local z → -x
    const w =
      spec.axis === 'x'
        ? { x0: ox + lx0, x1: ox + lx1, z0: oz + lz0, z1: oz + lz1 }
        : { x0: ox - lz1, x1: ox - lz0, z0: oz + lx0, z1: oz + lx1 };
    return { ...w, y0: spec.y + b.y0, y1: spec.y + b.y1, notch: b.notch, piece: spec };
  });
}

const EPS = 1e-4;

type Footprint = Pick<LocalBox, 'x0' | 'x1' | 'z0' | 'z1'>;

export function footprintOverlap(a: Footprint, b: Footprint): boolean {
  return a.x0 < b.x1 - EPS && b.x0 < a.x1 - EPS && a.z0 < b.z1 - EPS && b.z0 < a.z1 - EPS;
}
