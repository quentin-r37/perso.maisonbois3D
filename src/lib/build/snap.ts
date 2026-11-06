import { getDef, isRoofKind, type PieceDef } from '../pieces/catalog';
import {
  GRID_MAX,
  GRID_MIN,
  MAX_Y,
  alongDir,
  perpDir,
  pkey,
  type PieceSpec,
  type PlacedPiece
} from './grid';
import { BATTEN_F, findRoofs, roofOfPiece, gableUsedByRoof, type Roof } from './roof';

/** A grid point occupied by a piece; `notch` = a notch is cut there. */
export interface Occ {
  x: number;
  z: number;
  notch: boolean;
}

/** Notch positions of a log/gable, taking its facing into account (long log flipped). */
export function notchesOf(def: PieceDef, side: number | undefined): number[] {
  const n = def.notches ?? [];
  if (def.rotations === 4 && side === -1) return n.map((k) => def.length - k);
  return n;
}

/** Grid points occupied by a piece (used by the stacking solver). */
export function pointsOf(p: PieceSpec): Occ[] {
  const def = getDef(p.type);
  const [ax, az] = alongDir(p.axis);
  const out: Occ[] = [];
  switch (def.kind) {
    case 'roof':
    case 'ridge':
    case 'chimney':
    case 'batten':
      return out;
    case 'decor':
      out.push({ x: p.ix, z: p.iz, notch: false });
      return out;
    case 'insert':
      for (let k = 1; k < def.length; k++) out.push({ x: p.ix + ax * k, z: p.iz + az * k, notch: false });
      return out;
    case 'floor': {
      const [px, pz] = perpDir(p.axis);
      for (let k = 0; k <= def.length; k++)
        for (let j = 0; j <= def.depth; j++)
          out.push({ x: p.ix + ax * k + px * j, z: p.iz + az * k + pz * j, notch: false });
      return out;
    }
    default: {
      const notches = new Set(notchesOf(def, p.side));
      for (let k = 0; k <= def.length; k++)
        out.push({ x: p.ix + ax * k, z: p.iz + az * k, notch: notches.has(k) });
      return out;
    }
  }
}

export interface IndexEntry {
  piece: PieceSpec;
  notch: boolean;
}
export type PointIndex = Map<string, IndexEntry[]>;

export function buildIndex(pieces: readonly PieceSpec[]): PointIndex {
  const index: PointIndex = new Map();
  for (const p of pieces) addToIndex(index, p);
  return index;
}

export function addToIndex(index: PointIndex, p: PieceSpec) {
  for (const o of pointsOf(p)) {
    const k = pkey(o.x, o.z);
    const entry = { piece: p, notch: o.notch };
    const list = index.get(k);
    if (list) list.push(entry);
    else index.set(k, [entry]);
  }
}

/**
 * Height at which a piece comes to rest when dropped from above.
 * - parallel piece below: y ≥ its top
 * - crossing piece, with a notch on both pieces at that point: the notches fit
 *   into each other, y ≥ top − (its top notch + our bottom notch)
 * - crossing piece without a notch: it simply rests on top
 */
export function dropHeight(index: PointIndex, spec: PieceSpec): number {
  const def = getDef(spec.type);
  // Roof pieces take the height of their gables.
  if (isRoofKind(def.kind)) return spec.y;
  let y = 0;
  for (const o of pointsOf(spec)) {
    const list = index.get(pkey(o.x, o.z));
    if (!list) continue;
    for (const { piece: e, notch } of list) {
      const ed = getDef(e.type);
      const top = e.y + ed.h;
      const credit = e.axis !== spec.axis && notch && o.notch ? ed.topNotch + def.bottomNotch : 0;
      y = Math.max(y, top - credit);
    }
  }
  return y;
}

/** Normalizes a spec (optional fields) so specs can be compared. */
export function normalize(spec: PieceSpec): PieceSpec {
  const def = getDef(spec.type);
  const roof = isRoofKind(def.kind);
  return {
    type: spec.type,
    ix: spec.ix,
    iz: spec.iz,
    y: spec.y,
    axis: def.rotations === 1 && !roof ? 'x' : spec.axis,
    side: def.rotations === 4 || def.kind === 'roof' || def.kind === 'batten' ? (spec.side ?? 1) : 1,
    slot: roof ? (spec.slot ?? 0) : 0,
    param: roof ? (spec.param ?? 0) : 0,
    param2: roof ? (spec.param2 ?? 0) : 0
  };
}

export function specKey(spec: PieceSpec): string {
  const n = normalize(spec);
  return `${n.type}|${n.ix}|${n.iz}|${n.y}|${n.axis}|${n.side}|${n.slot}|${n.param}|${n.param2}`;
}

export interface Validation {
  ok: boolean;
  reason?: string;
}

function validateRoof(spec: PieceSpec, pieces: readonly PieceSpec[], roofs: Roof[]): Validation {
  const def = getDef(spec.type);
  const rk = roofOfPiece(spec);
  const roof = roofs.find((r) => r.key === rk);
  if (!roof) return { ok: false, reason: 'You need two gables facing each other' };
  const n = normalize(spec);
  const slot = n.slot!;
  const onRoof = pieces.filter((p) => roofOfPiece(p) === rk).map(normalize);
  const battens = (side: number) => onRoof.filter((p) => p.type === 'batten' && p.side === side).length;
  switch (def.kind) {
    case 'batten':
      if (slot < 0 || slot >= BATTEN_F.length) return { ok: false, reason: 'No notch here' };
      if (onRoof.some((p) => p.type === 'batten' && p.side === n.side && p.slot === slot))
        return { ok: false, reason: 'There is already a batten here' };
      return { ok: true };
    case 'roof':
      if (slot < 0 || slot >= roof.n) return { ok: false, reason: 'Outside the roof' };
      if (battens(n.side!) < BATTEN_F.length)
        return { ok: false, reason: 'Place the battens on this slope first' };
      if (onRoof.some((p) => p.type === 'roof-plank' && p.side === n.side && p.slot === slot))
        return { ok: false, reason: 'There is already a plank here' };
      return { ok: true };
    case 'ridge': {
      if (slot < 0 || slot + def.length > roof.n * 4) return { ok: false, reason: 'Goes past the roof' };
      if (battens(1) < BATTEN_F.length || battens(-1) < BATTEN_F.length)
        return { ok: false, reason: 'Place the battens on both slopes first' };
      const overlap = onRoof.some((p) => {
        const d = getDef(p.type);
        if (d.kind !== 'ridge') return false;
        return slot < p.slot! + d.length && p.slot! < slot + def.length;
      });
      if (overlap) return { ok: false, reason: 'Overlaps another ridge cap' };
      return { ok: true };
    }
    case 'chimney':
      if (slot < 0 || slot + def.length > roof.n * 4) return { ok: false, reason: 'Goes past the roof' };
      if (onRoof.some((p) => p.type === 'chimney' && Math.abs(p.slot! - slot) < def.length))
        return { ok: false, reason: 'There is already a chimney here' };
      return { ok: true };
  }
  return { ok: true };
}

/** Checks that a piece (with its y already computed) can be placed. */
export function validate(
  spec: PieceSpec,
  pieces: readonly PieceSpec[],
  index: PointIndex,
  roofs: Roof[] = findRoofs(pieces)
): Validation {
  const def = getDef(spec.type);
  if (isRoofKind(def.kind)) return validateRoof(spec, pieces, roofs);
  for (const o of pointsOf(spec)) {
    if (o.x < GRID_MIN || o.x > GRID_MAX || o.z < GRID_MIN || o.z > GRID_MAX)
      return { ok: false, reason: 'Off the table' };
  }
  if (spec.y + def.h > MAX_Y) return { ok: false, reason: 'Too high!' };
  if (spec.y !== dropHeight(index, spec)) return { ok: false, reason: 'This piece would fall' };
  return { ok: true };
}

/** A piece can be removed only if nothing rests on it. */
export function canRemove(p: PlacedPiece, pieces: readonly PlacedPiece[], index: PointIndex): Validation {
  const def = getDef(p.type);
  if (isRoofKind(def.kind)) return { ok: true };
  if (def.kind === 'gable' && gableUsedByRoof(p, pieces))
    return { ok: false, reason: 'Remove the roof first' };
  for (const o of pointsOf(p)) {
    const list = index.get(pkey(o.x, o.z));
    if (!list) continue;
    if (list.some((e) => e.piece !== p && e.piece.y > p.y))
      return { ok: false, reason: 'Remove the pieces on top first' };
  }
  return { ok: true };
}
