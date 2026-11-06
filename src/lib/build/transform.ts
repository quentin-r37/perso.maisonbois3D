import { getDef, isRoofKind } from '../pieces/catalog';
import { G, Q, alongDir, perpDir, type PieceSpec } from './grid';
import { BATTEN_F, roofPieceCenter, slopePoint } from './roof';
import { worldBoxes } from './volumes';

export interface Transform {
  position: [number, number, number];
  rotationY: number;
}

/**
 * Transform of a piece's mesh. Geometries are built along local +X (world units),
 * starting at the origin, centered in Z, with the base at y = 0.
 */
export function transformOf(spec: PieceSpec): Transform {
  const def = getDef(spec.type);
  const y = spec.y * Q;
  let rotationY = spec.axis === 'x' ? 0 : -Math.PI / 2;

  if (isRoofKind(def.kind)) {
    const c = roofPieceCenter(spec);
    return {
      position: spec.axis === 'x' ? [spec.ix * G, y, c] : [c, y, spec.iz * G],
      rotationY
    };
  }

  let x = spec.ix * G;
  let z = spec.iz * G;
  if (spec.side === -1 && def.rotations === 4) {
    // half-turn around the center of the footprint (floors: same rectangle, facing the other way)
    rotationY += Math.PI;
    const [ax, az] = alongDir(spec.axis);
    const [qx, qz] = perpDir(spec.axis);
    x += (ax * def.length + qx * def.depth) * G;
    z += (az * def.length + qz * def.depth) * G;
  }
  return { position: [x, y, z], rotationY };
}

/** Approximate world center of a piece (for the guided-mode magnet). */
export function centerOf(spec: PieceSpec): [number, number, number] {
  const def = getDef(spec.type);
  const t = transformOf(spec);
  if (isRoofKind(def.kind)) {
    const W = spec.param ?? 0;
    const Ww = W * G;
    let local: number;
    if (def.kind === 'ridge' || def.kind === 'chimney') local = Ww / 2;
    else if (def.kind === 'batten') {
      const [lx] = slopePoint(W, BATTEN_F[spec.slot ?? 0] ?? 0.5);
      local = spec.side === 1 ? Ww - lx : lx;
    } else local = spec.side === 1 ? Ww * 0.75 : Ww * 0.25;
    const [x, y, z] = t.position;
    return spec.axis === 'x' ? [x + local, y + 1, z] : [x, y + 1, z + local];
  }
  const [cx, cz] = boxesCenter(spec);
  return [cx, spec.y * Q + (def.h * Q) / 2, cz];
}

/** Center (x, z) of the bounding box of a piece's volumes (the piece itself, not its grid footprint). */
export function boxesCenter(spec: PieceSpec): [number, number] {
  const b = worldBoxes(spec);
  if (!b.length) return [spec.ix * G, spec.iz * G];
  const x0 = Math.min(...b.map((e) => e.x0));
  const x1 = Math.max(...b.map((e) => e.x1));
  const z0 = Math.min(...b.map((e) => e.z0));
  const z1 = Math.max(...b.map((e) => e.z1));
  return [(x0 + x1) / 2, (z0 + z1) / 2];
}
