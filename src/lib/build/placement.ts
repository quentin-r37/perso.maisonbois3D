import { getDef, isRoofKind } from '../pieces/catalog';
import { G, Q, type PieceSpec, type Side } from './grid';
import { contactsOf, dropHeight, specKey, validate, type Contact, type PointIndex, type Validation } from './snap';
import { PLANK_W, RIDGE_DIV, nearestBatten, roofSpec, type Roof } from './roof';
import { boxesCenter, centerOf } from './transform';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export interface Hit {
  kind: 'ground' | 'piece' | 'roof';
  point: { x: number; y: number; z: number };
  normal?: { x: number; y: number; z: number };
  uid?: number;
  roofKey?: string;
  side?: Side;
  /** The pointer ray (world space), to find where it crosses the plane the piece rests on. */
  ray?: { origin: { x: number; y: number; z: number }; dir: { x: number; y: number; z: number } };
}

export interface BuildView {
  pieces: readonly PieceSpec[];
  index: PointIndex;
  roofs: Roof[];
}

export interface Ghost extends Validation {
  spec: PieceSpec;
  /** Where the notches will lock into each other (visual cue). */
  locks?: Contact[];
  /**
   * Allowed, but only set down: a notched piece (log, gable) above the table whose
   * notches lock into nothing. In the real kit every one of them sits in a notch.
   */
  loose?: boolean;
}

/** Pieces meant to lock: the notched ones (logs, gables), once above the table. */
export function wantsLock(spec: PieceSpec): boolean {
  return !!getDef(spec.type).notches?.length && spec.y > 0;
}

export function normRot(type: string, rot: number) {
  const n = getDef(type).rotations;
  return ((rot % n) + n) % n;
}

export function rotOf(type: string, rot: number): { axis: 'x' | 'z'; side: Side } {
  const r = normRot(type, rot);
  return { axis: r % 2 === 0 ? 'x' : 'z', side: r >= 2 ? -1 : 1 };
}

/** Point (x, z) the piece is centered on: the hit, pushed out when it is a side face. */
export function aimPoint(hit: Hit): [number, number] {
  let px = hit.point.x;
  let pz = hit.point.z;
  if (hit.kind === 'piece' && hit.normal && Math.abs(hit.normal.y) < 0.5) {
    // side face: place next to it rather than on top
    px += hit.normal.x * 0.2;
    pz += hit.normal.z * 0.2;
  }
  return [px, pz];
}

/** Converts a raycast hit into a candidate piece (with its rest height). */
export function candidateFromHit(type: string, rot: number, hit: Hit, view: BuildView): PieceSpec | null {
  const def = getDef(type);

  if (isRoofKind(def.kind)) {
    if (hit.kind !== 'roof' || !hit.roofKey) return null;
    const roof = view.roofs.find((r) => r.key === hit.roofKey);
    if (!roof) return null;
    const perp = roof.axis === 'x' ? hit.point.z : hit.point.x;
    const localX = roof.axis === 'x' ? hit.point.x - roof.ix * G : hit.point.z - roof.iz * G;
    const side: Side = localX < (roof.W * G) / 2 ? -1 : 1;
    const u = (perp - roof.start) / PLANK_W; // position along the ridge, in planks
    let slot: number;
    if (def.kind === 'batten') slot = nearestBatten(roof.W, localX);
    else if (def.kind === 'roof') slot = clamp(Math.floor(u), 0, roof.n - 1);
    else if (def.kind === 'ridge')
      // ridge caps stop on the plate joints
      slot = clamp(Math.round(u - def.length / RIDGE_DIV / 2) * RIDGE_DIV, 0, roof.n * RIDGE_DIV - def.length);
    else slot = clamp(Math.round(u * RIDGE_DIV - def.length / 2), 0, roof.n * RIDGE_DIV - def.length);
    return roofSpec(type, roof, side, slot);
  }

  return specAt(type, rot, resolveAim(type, rot, hit, view), view);
}

/** The piece centered on (px, pz), at its rest height. */
function specAt(type: string, rot: number, [px, pz]: readonly [number, number], view: BuildView): PieceSpec {
  const { axis, side } = rotOf(type, rot);
  // the piece itself (not its grid footprint) is centered under the cursor:
  // a half floor goes in the half of the room being pointed at
  const [cx, cz] = boxesCenter({ type, ix: 0, iz: 0, y: 0, axis, side });
  const ix = Math.round((px - cx) / G);
  const iz = Math.round((pz - cz) / G);
  const spec: PieceSpec = { type, ix, iz, y: 0, axis, side };
  spec.y = dropHeight(view.index, spec);
  return spec;
}

/**
 * Point (x, z) the piece is centered on, corrected for parallax: when the piece rests
 * well above the point hit (a floor laid on top of walls while the pointer ray hits the
 * table between them, or the inside face of a wall), it goes where the ray crosses the
 * plane it rests on, i.e. where it is seen under the cursor, not where the ray ends.
 */
export function resolveAim(type: string, rot: number, hit: Hit, view: BuildView): [number, number] {
  const aim = aimPoint(hit);
  const ray = hit.ray;
  if (!ray || ray.dir.y > -1e-3 || isRoofKind(getDef(type).kind)) return aim;
  let cur = aim;
  let y = specAt(type, rot, cur, view).y;
  for (let k = 0; k < 4; k++) {
    const plane = y * Q;
    if (plane - hit.point.y < Q * 1.5) return aim; // rests (about) where the ray hits
    const t = (plane - ray.origin.y) / ray.dir.y;
    if (t <= 0) return aim;
    const next: [number, number] = [ray.origin.x + ray.dir.x * t, ray.origin.z + ray.dir.z * t];
    const ny = specAt(type, rot, next, view).y;
    if (ny === y) return next; // the piece rests on the plane the ray was cut with
    cur = next;
    y = ny;
  }
  return aim;
}

export function evaluate(spec: PieceSpec, view: BuildView): Ghost {
  const v = validate(spec, view.pieces, view.index, view.roofs);
  const locks = v.ok && !isRoofKind(getDef(spec.type).kind) ? contactsOf(view.index, spec).supports.filter((c) => c.lock) : [];
  return { spec, ...v, locks, loose: v.ok && !locks.length && wantsLock(spec) };
}

/** How far (world units, cursor to piece center) the magnet pulls a piece into a notch. */
export const SNAP_RADIUS = 1.3 * G;
/** Once caught, a piece is only let go beyond this distance (no flicker between two spots). */
export const SNAP_KEEP = 1.7 * G;
const SNAP_REACH = 2;

/**
 * Magnet toward the notches: around the spot under the cursor, the spot where the
 * piece locks into notches, if one is close enough. Preferred: the closest, then the
 * one with the most locks; `held` (the spot already caught) is sticky.
 */
export function snapToLock(
  spec: PieceSpec,
  aim: readonly [number, number],
  view: BuildView,
  held: PieceSpec | null = null
): Ghost | null {
  if (!getDef(spec.type).notches?.length) return null;
  const heldKey = held && held.type === spec.type ? specKey(held) : null;
  let best: { g: Ghost; score: number } | null = null;
  for (let dx = -SNAP_REACH; dx <= SNAP_REACH; dx++)
    for (let dz = -SNAP_REACH; dz <= SNAP_REACH; dz++) {
      const s: PieceSpec = { ...spec, ix: spec.ix + dx, iz: spec.iz + dz };
      s.y = dropHeight(view.index, s);
      const sticky = heldKey === specKey(s);
      const [cx, cz] = boxesCenter(s);
      const d = Math.hypot(cx - aim[0], cz - aim[1]);
      if (d > (sticky ? SNAP_KEEP : SNAP_RADIUS)) continue;
      const g = evaluate(s, view);
      if (!g.ok || !g.locks?.length) continue;
      const score = d - (sticky ? 0.4 * G : 0) - 0.15 * G * g.locks.length;
      if (!best || score < best.score) best = { g, score };
    }
  return best?.g ?? null;
}

/**
 * Affordance: if the spot under the cursor does not work, look for the closest
 * spot (one step around) where the piece fits, preferring the ones where its
 * notches lock together.
 */
export function nearestValid(spec: PieceSpec, view: BuildView): Ghost | null {
  if (isRoofKind(getDef(spec.type).kind)) return null;
  let best: { g: Ghost; score: number } | null = null;
  for (let dx = -1; dx <= 1; dx++)
    for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const s: PieceSpec = { ...spec, ix: spec.ix + dx, iz: spec.iz + dz };
      s.y = dropHeight(view.index, s);
      const g = evaluate(s, view);
      if (!g.ok) continue;
      // prefer: notches locked, then closest, then lowest
      const score = (g.locks?.length ? 0 : 10) + Math.hypot(dx, dz) + s.y * 0.01;
      if (!best || score < best.score) best = { g, score };
    }
  return best?.g ?? null;
}

/** Guided mode: picks the expected piece closest to the hit point. */
export function magnet(type: string, hit: Hit, expected: readonly PieceSpec[], radius = 1.6): PieceSpec | null {
  let best: PieceSpec | null = null;
  let bestD = radius;
  for (const e of expected) {
    if (e.type !== type) continue;
    const [cx, , cz] = centerOf(e);
    const d = Math.hypot(cx - hit.point.x, cz - hit.point.z);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}
