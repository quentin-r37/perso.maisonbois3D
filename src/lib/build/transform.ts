import { getDef, isRoofKind } from '../pieces/catalog';
import { G, Q, alongDir, type PieceSpec } from './grid';
import { BATTEN_F, roofPieceCenter, slopePoint } from './roof';

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
    rotationY += Math.PI;
    const [ax, az] = alongDir(spec.axis);
    x += ax * def.length * G;
    z += az * def.length * G;
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
  const [ax, az] = alongDir(spec.axis);
  const half = (def.length / 2) * G;
  const depth = def.kind === 'floor' ? (def.depth / 2) * G : 0;
  const px = spec.axis === 'x' ? 0 : -1;
  const pz = spec.axis === 'x' ? 1 : 0;
  return [
    spec.ix * G + ax * half + px * depth,
    spec.y * Q + (def.h * Q) / 2,
    spec.iz * G + az * half + pz * depth
  ];
}
