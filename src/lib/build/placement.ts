import { getDef, isRoofKind } from '../pieces/catalog';
import { G, alongDir, perpDir, type PieceSpec, type Side } from './grid';
import { contactsOf, dropHeight, validate, type Contact, type PointIndex, type Validation } from './snap';
import { PLANK_W, nearestBatten, roofSpec, type Roof } from './roof';
import { centerOf } from './transform';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export interface Hit {
  kind: 'ground' | 'piece' | 'roof';
  point: { x: number; y: number; z: number };
  normal?: { x: number; y: number; z: number };
  uid?: number;
  roofKey?: string;
  side?: Side;
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
}

export function normRot(type: string, rot: number) {
  const n = getDef(type).rotations;
  return ((rot % n) + n) % n;
}

export function rotOf(type: string, rot: number): { axis: 'x' | 'z'; side: Side } {
  const r = normRot(type, rot);
  return { axis: r % 2 === 0 ? 'x' : 'z', side: r >= 2 ? -1 : 1 };
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
    else slot = clamp(Math.round(u * 4 - def.length / 2), 0, roof.n * 4 - def.length);
    return roofSpec(type, roof, side, slot);
  }

  let px = hit.point.x;
  let pz = hit.point.z;
  if (hit.kind === 'piece' && hit.normal && Math.abs(hit.normal.y) < 0.5) {
    // side face: place next to it rather than on top
    px += hit.normal.x * 0.2;
    pz += hit.normal.z * 0.2;
  }
  const { axis, side } = rotOf(type, rot);
  const [ax, az] = alongDir(axis);
  const [qx, qz] = perpDir(axis);
  const L = def.length;
  const D = def.kind === 'floor' ? def.depth : 0;
  const ix = Math.round(px / G - (ax * L) / 2 - (qx * D) / 2);
  const iz = Math.round(pz / G - (az * L) / 2 - (qz * D) / 2);
  const spec: PieceSpec = { type, ix, iz, y: 0, axis, side };
  spec.y = dropHeight(view.index, spec);
  return spec;
}

export function evaluate(spec: PieceSpec, view: BuildView): Ghost {
  const v = validate(spec, view.pieces, view.index, view.roofs);
  const locks = v.ok && !isRoofKind(getDef(spec.type).kind) ? contactsOf(view.index, spec).supports.filter((c) => c.lock) : [];
  return { spec, ...v, locks };
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
