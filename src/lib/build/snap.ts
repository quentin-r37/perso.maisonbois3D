import { getDef, isRoofKind, type PieceDef } from '../pieces/catalog';
import { GRID_MAX, GRID_MIN, MAX_Y, Q, alongDir, perpDir, type PieceSpec, type PlacedPiece } from './grid';
import { BATTEN_F, RIDGE_DIV, findRoofs, roofOfPiece, gableUsedByRoof, type Roof } from './roof';
import { footprintOverlap, localBoxes, worldBoxes, type WorldBox } from './volumes';

// ---------------------------------------------------------------------------
// Grid points (bounds, notch positions)
// ---------------------------------------------------------------------------

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

/** Grid points covered by a piece. */
export function pointsOf(p: PieceSpec): Occ[] {
  const def = getDef(p.type);
  const [ax, az] = alongDir(p.axis);
  const out: Occ[] = [];
  if (isRoofKind(def.kind)) return out;
  if (def.kind === 'floor') {
    const [px, pz] = perpDir(p.axis);
    for (let k = 0; k <= def.length; k++)
      for (let j = 0; j <= def.depth; j++)
        out.push({ x: p.ix + ax * k + px * j, z: p.iz + az * k + pz * j, notch: false });
    return out;
  }
  const notches = new Set(notchesOf(def, p.side));
  for (let k = 0; k <= def.length; k++) out.push({ x: p.ix + ax * k, z: p.iz + az * k, notch: notches.has(k) });
  return out;
}

// ---------------------------------------------------------------------------
// Volume index: each piece = boxes (heads, notches, sections)
// ---------------------------------------------------------------------------

const CELL = 1;

export interface PointIndex {
  boxes: WorldBox[];
  cells: Map<string, WorldBox[]>;
}

function cellsOf(b: { x0: number; x1: number; z0: number; z1: number }): string[] {
  const out: string[] = [];
  for (let i = Math.floor(b.x0 / CELL); i <= Math.floor(b.x1 / CELL); i++)
    for (let j = Math.floor(b.z0 / CELL); j <= Math.floor(b.z1 / CELL); j++) out.push(`${i},${j}`);
  return out;
}

export function buildIndex(pieces: readonly PieceSpec[]): PointIndex {
  const index: PointIndex = { boxes: [], cells: new Map() };
  for (const p of pieces) addToIndex(index, p);
  return index;
}

export function addToIndex(index: PointIndex, p: PieceSpec) {
  for (const b of worldBoxes(p)) {
    index.boxes.push(b);
    for (const c of cellsOf(b)) {
      const list = index.cells.get(c);
      if (list) list.push(b);
      else index.cells.set(c, [b]);
    }
  }
}

/** Boxes of the index whose footprint overlaps `b`. */
function near(index: PointIndex, b: { x0: number; x1: number; z0: number; z1: number }): WorldBox[] {
  const seen = new Set<WorldBox>();
  for (const c of cellsOf(b)) for (const e of index.cells.get(c) ?? []) if (footprintOverlap(e, b)) seen.add(e);
  return [...seen];
}

/**
 * Height at which a piece comes to rest when dropped from above: for each of its boxes,
 * it stops on the highest box below it. The notches being thinner boxes, two logs
 * crossed at their notches sink into each other by 2 Q; heads or full sections
 * rest on top.
 */
export function dropHeight(index: PointIndex, spec: PieceSpec): number {
  const def = getDef(spec.type);
  if (isRoofKind(def.kind)) return spec.y;
  let y = 0;
  for (const b of worldBoxes({ ...spec, y: 0 })) {
    for (const e of near(index, b)) if (e.piece !== spec) y = Math.max(y, e.y1 - b.y0);
  }
  return y;
}

export interface Contact {
  /** World center of the contact. */
  x: number;
  y: number;
  z: number;
  /** Two notches fitting into each other. */
  lock: boolean;
}

/** Contacts of a piece placed at its height: what it rests on, and where the notches lock. */
export function contactsOf(index: PointIndex, spec: PieceSpec): { supports: Contact[]; rect: [number, number, number, number] | null } {
  const supports: Contact[] = [];
  let rect: [number, number, number, number] | null = null;
  const grow = (x0: number, x1: number, z0: number, z1: number) => {
    rect = rect ? [Math.min(rect[0], x0), Math.max(rect[1], x1), Math.min(rect[2], z0), Math.max(rect[3], z1)] : [x0, x1, z0, z1];
  };
  for (const b of worldBoxes(spec)) {
    if (b.y0 === 0) {
      grow(b.x0, b.x1, b.z0, b.z1);
      continue;
    }
    for (const e of near(index, b)) {
      if (e.piece === spec || e.y1 !== b.y0) continue;
      const x0 = Math.max(b.x0, e.x0);
      const x1 = Math.min(b.x1, e.x1);
      const z0 = Math.max(b.z0, e.z0);
      const z1 = Math.min(b.z1, e.z1);
      grow(x0, x1, z0, z1);
      supports.push({ x: (x0 + x1) / 2, y: b.y0 * Q, z: (z0 + z1) / 2, lock: !!(b.notch && e.notch) });
    }
  }
  return { supports, rect };
}

/** Is the piece balanced (its center above what supports it)? */
export function isStable(index: PointIndex, spec: PieceSpec): boolean {
  const { rect } = contactsOf(index, spec);
  if (!rect) return false;
  const boxes = worldBoxes(spec);
  const cx = (Math.min(...boxes.map((b) => b.x0)) + Math.max(...boxes.map((b) => b.x1))) / 2;
  const cz = (Math.min(...boxes.map((b) => b.z0)) + Math.max(...boxes.map((b) => b.z1))) / 2;
  const tol = 0.02;
  const [x0, x1, z0, z1] = rect;
  return cx >= x0 - tol && cx <= x1 + tol && cz >= z0 - tol && cz <= z1 + tol;
}

// ---------------------------------------------------------------------------

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
  const isBeam = (p: PieceSpec) => getDef(p.type).kind === 'batten';
  const battens = (side: number) => onRoof.filter((p) => isBeam(p) && p.side === side).length;
  switch (def.kind) {
    case 'batten':
      if (slot < 0 || slot >= BATTEN_F.length) return { ok: false, reason: 'No notch here' };
      if (def.length !== roof.D)
        return {
          ok: false,
          reason: def.length < roof.D ? 'This beam is too short for this roof: take the long one' : 'This beam is too long for this roof: take the short one'
        };
      if (onRoof.some((p) => isBeam(p) && p.side === n.side && p.slot === slot))
        return { ok: false, reason: 'There is already a beam here' };
      return { ok: true };
    case 'roof':
      if (slot < 0 || slot >= roof.n) return { ok: false, reason: 'Outside the roof' };
      if (battens(n.side!) < BATTEN_F.length)
        return { ok: false, reason: 'Place the beams on this slope first' };
      if (onRoof.some((p) => p.type === 'roof-plank' && p.side === n.side && p.slot === slot))
        return { ok: false, reason: 'There is already a plank here' };
      return { ok: true };
    case 'ridge': {
      if (slot < 0 || slot + def.length > roof.n * RIDGE_DIV) return { ok: false, reason: 'Goes past the roof' };
      if (slot % RIDGE_DIV !== 0) return { ok: false, reason: 'A ridge cap stops on the joints between the plates' };
      if (battens(1) < BATTEN_F.length || battens(-1) < BATTEN_F.length)
        return { ok: false, reason: 'Place the beams on both slopes first' };
      const overlap = onRoof.some((p) => {
        const d = getDef(p.type);
        if (d.kind !== 'ridge') return false;
        return slot < p.slot! + d.length && p.slot! < slot + def.length;
      });
      if (overlap) return { ok: false, reason: 'Overlaps another ridge cap' };
      return { ok: true };
    }
    case 'chimney':
      if (slot < 0 || slot + def.length > roof.n * RIDGE_DIV) return { ok: false, reason: 'Goes past the roof' };
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
  if (spec.y !== dropHeight(index, spec)) return { ok: false, reason: 'No room for this piece here' };
  if (!isStable(index, spec)) return { ok: false, reason: 'It would tip over: nothing holds it up on that side' };
  return { ok: true };
}

/** A piece can be removed only if nothing rests on it. */
export function canRemove(p: PlacedPiece, pieces: readonly PlacedPiece[], index: PointIndex): Validation {
  const def = getDef(p.type);
  if (isRoofKind(def.kind)) return { ok: true };
  if (def.kind === 'gable' && gableUsedByRoof(p, pieces))
    return { ok: false, reason: 'Remove the roof first' };
  for (const b of worldBoxes(p)) {
    for (const e of near(index, b)) {
      if (e.piece !== p && e.y0 === b.y1) return { ok: false, reason: 'Remove the pieces on top first' };
    }
  }
  return { ok: true };
}

export { localBoxes };
