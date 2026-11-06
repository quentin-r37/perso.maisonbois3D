import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Matrix4,
  Path,
  Shape,
  SphereGeometry,
  Euler,
  Quaternion,
  Vector3
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { getDef, type Paint } from './catalog';
import { G, LOG_W, OVERHANG, Q, type PieceSpec } from '../build/grid';
import {
  BATTEN_F,
  battenLength,
  EAVE,
  GABLE_C,
  GABLE_T,
  PLANK_T,
  PLANK_W,
  RIDGE_DIV,
  PLANK_GROOVE,
  ROOF_LIFT,
  SLOPE,
  SLOPE_ANGLE,
  BATTEN as BATTEN_W,
  BATTEN_NOTCH,
  battenPose,
  gableHeight,
  slopePoint
} from '../build/roof';

export interface PieceGeometry {
  geometry: BufferGeometry;
  paints: Paint[];
}

interface Part {
  geo: BufferGeometry;
  paint: Paint;
}

/** UVs projected in local space: wood fibers follow local X. */
function planarUV(g: BufferGeometry, su = 0.5, sv = 1) {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) {
      u = x * su;
      v = z * sv;
    } else if (ax >= az) {
      u = z * sv;
      v = y * sv;
    } else {
      u = x * su;
      v = y * sv;
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  return g;
}

function prep(g: BufferGeometry): BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  if (ng !== g) g.dispose();
  for (const name of Object.keys(ng.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') ng.deleteAttribute(name);
  }
  return ng;
}

function finalize(g: BufferGeometry, m?: Matrix4, uv = true): BufferGeometry {
  const ng = prep(g);
  if (uv) planarUV(ng);
  if (m) ng.applyMatrix4(m);
  return ng;
}

const mat = (pos: [number, number, number], rot?: [number, number, number]) => {
  const m = new Matrix4();
  const q = rot ? new Quaternion().setFromEuler(new Euler(...rot)) : new Quaternion();
  m.compose(new Vector3(...pos), q, new Vector3(1, 1, 1));
  return m;
};

/** Rounded box defined by its bounds. */
function rbox(
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  paint: Paint,
  r = 0.03
): Part {
  const w = x1 - x0;
  const h = y1 - y0;
  const d = z1 - z0;
  const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const g = rr > 0.004 ? new RoundedBoxGeometry(w, h, d, 2, rr) : new BoxGeometry(w, h, d);
  return { geo: finalize(g, mat([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2])), paint };
}

/** Box centered at `c`, rotated, built in its own frame (so the UVs follow its length). */
function rboxAt(
  size: [number, number, number],
  c: [number, number, number],
  rot: [number, number, number],
  paint: Paint,
  r = 0.02
): Part {
  const rr = Math.min(r, size[0] / 2 - 0.001, size[1] / 2 - 0.001, size[2] / 2 - 0.001);
  const g = rr > 0.004 ? new RoundedBoxGeometry(...size, 2, rr) : new BoxGeometry(...size);
  return { geo: finalize(g, mat(c, rot)), paint };
}

function extrude(shape: Shape, depth: number, paint: Paint, m?: Matrix4, bevel = 0.012): Part {
  const g = new ExtrudeGeometry(shape, {
    depth: depth - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments: 20
  });
  g.translate(0, 0, -depth / 2 + bevel);
  return { geo: finalize(g, m), paint };
}

function mergeParts(parts: Part[]): PieceGeometry {
  const byPaint = new Map<Paint, BufferGeometry[]>();
  for (const p of parts) {
    const list = byPaint.get(p.paint) ?? [];
    list.push(p.geo);
    byPaint.set(p.paint, list);
  }
  const paints: Paint[] = [];
  const geos: BufferGeometry[] = [];
  for (const [paint, list] of byPaint) {
    paints.push(paint);
    geos.push(list.length === 1 ? list[0] : mergeGeometries(list, false)!);
  }
  const geometry = mergeGeometries(geos, true)!;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, paints };
}

// ---------------------------------------------------------------------------
// Logs
// ---------------------------------------------------------------------------

/** Log built along +X: full sections, notches (top & bottom) at the given positions (in G), heads at the ends. */
function logParts(notches: number[], hq: number, topNotch: number, bottomNotch: number, paint: Paint = 'wood'): Part[] {
  const H = hq * Q;
  const W = LOG_W;
  const z0 = -W / 2;
  const z1 = W / 2;
  const nb = bottomNotch * Q;
  const nt = H - topNotch * Q;
  const xs = [...notches].sort((a, b) => a - b).map((k) => k * G);
  const parts: Part[] = [];
  const first = xs[0];
  const last = xs[xs.length - 1];
  parts.push(rbox(first - OVERHANG, first - W / 2, 0, H, z0, z1, paint, 0.025));
  xs.forEach((x, i) => {
    parts.push(rbox(x - W / 2, x + W / 2, nb, nt, z0 + 0.008, z1 - 0.008, paint, 0.015));
    if (i < xs.length - 1) parts.push(rbox(x + W / 2, xs[i + 1] - W / 2, 0, H, z0, z1, paint, 0.025));
  });
  parts.push(rbox(last + W / 2, last + OVERHANG, 0, H, z0, z1, paint, 0.025));
  return parts;
}

// ---------------------------------------------------------------------------
// Openings: white plastic frames, red leaves/shutters
// ---------------------------------------------------------------------------

/** The heads of the small logs on either side of the opening stop here. */
const FRAME_X0 = OVERHANG - G;
const POST = 0.09;
/** Small margin of the frame beyond the heads. */
const JAMB = 0.03;

/** Small fir tree cutout (shutters). */
function treeHole(cx: number, cy: number, s: number): Path {
  const p = new Path();
  p.moveTo(cx, cy + s);
  p.lineTo(cx + s * 0.45, cy + s * 0.25);
  p.lineTo(cx + s * 0.2, cy + s * 0.25);
  p.lineTo(cx + s * 0.55, cy - s * 0.4);
  p.lineTo(cx + s * 0.1, cy - s * 0.4);
  p.lineTo(cx + s * 0.1, cy - s * 0.7);
  p.lineTo(cx - s * 0.1, cy - s * 0.7);
  p.lineTo(cx - s * 0.1, cy - s * 0.4);
  p.lineTo(cx - s * 0.55, cy - s * 0.4);
  p.lineTo(cx - s * 0.2, cy + s * 0.25);
  p.lineTo(cx - s * 0.45, cy + s * 0.25);
  p.closePath();
  return p;
}

/** Little horse cutout (door leaves). */
const HORSE: [number, number][] = [
  [-0.5, 0.15],
  [-0.38, 0.22],
  [0.12, 0.22],
  [0.28, 0.44],
  [0.3, 0.56],
  [0.36, 0.47],
  [0.5, 0.3],
  [0.47, 0.21],
  [0.31, 0.26],
  [0.22, 0.04],
  [0.22, -0.5],
  [0.12, -0.5],
  [0.11, -0.12],
  [-0.24, -0.12],
  [-0.25, -0.5],
  [-0.36, -0.5],
  [-0.4, -0.04],
  [-0.48, -0.22],
  [-0.53, -0.16]
];

function horseHole(cx: number, cy: number, s: number, dir: 1 | -1): Path {
  const p = new Path();
  HORSE.forEach(([x, y], i) => {
    const px = cx + x * s * dir;
    const py = cy + y * s;
    if (i === 0) p.moveTo(px, py);
    else p.lineTo(px, py);
  });
  p.closePath();
  return p;
}

function panel(x0: number, x1: number, h: number, hole?: Path): Shape {
  const s = new Shape();
  s.moveTo(x0, 0);
  s.lineTo(x1, 0);
  s.lineTo(x1, h);
  s.lineTo(x0, h);
  s.closePath();
  if (hole) s.holes.push(hole);
  return s;
}

/**
 * Leaf hinged at `hinge`, built in the XY plane (x from the hinge), opening toward +z.
 * dir = 1: leaf extends toward +x; dir = -1: toward -x.
 */
function hingedLeaf(shape: Shape, t: number, paint: Paint, hinge: [number, number, number], angle: number, dir: 1 | -1): Part {
  const m = new Matrix4().multiplyMatrices(mat(hinge, [0, -angle * dir, 0]), mat([0, 0, t / 2]));
  return extrude(shape, t, paint, m, 0.01);
}

function doorParts(L: number, hq: number): Part[] {
  const H = hq * Q;
  const x0 = FRAME_X0;
  const x1 = L * G - FRAME_X0;
  const d = LOG_W * 1.1;
  const parts: Part[] = [
    // white frame; the posts also fill the empty notches of the neighboring logs
    rbox(x0 - JAMB, x0 + POST, 0, H, -d / 2, d / 2, 'white'),
    rbox(x1 - POST, x1 + JAMB, 0, H, -d / 2, d / 2, 'white'),
    rbox(x0, x1, H - 0.12, H, -d / 2, d / 2, 'white'),
    rbox(x0 + POST, x1 - POST, 0, 0.04, -d / 2, d / 2, 'white', 0.015)
  ];
  const inner0 = x0 + POST;
  const inner1 = x1 - POST;
  const lw = (inner1 - inner0) / 2 - 0.01;
  const lh = H - 0.18;
  const t = 0.05;
  const hingeZ = d / 2 - 0.02;
  const s = 0.24;
  const openL = 1.0;
  const openR = 0.3;
  parts.push(
    hingedLeaf(panel(0, lw, lh, horseHole(lw / 2, lh * 0.74, s, 1)), t, 'red', [inner0, 0.05, hingeZ], openL, 1),
    hingedLeaf(panel(-lw, 0, lh, horseHole(-lw / 2, lh * 0.74, s, -1)), t, 'red', [inner1, 0.05, hingeZ], openR, -1)
  );
  const k = lw - 0.07;
  parts.push(
    rboxAt([0.04, 0.04, 0.07], [inner0 + Math.cos(openL) * k, lh * 0.45, hingeZ + Math.sin(openL) * k + 0.05], [0, -openL, 0], 'dark', 0.015),
    rboxAt([0.04, 0.04, 0.07], [inner1 - Math.cos(openR) * k, lh * 0.45, hingeZ + Math.sin(openR) * k + 0.05], [0, openR, 0], 'dark', 0.015)
  );
  return parts;
}

function windowParts(L: number, hq: number): Part[] {
  const H = hq * Q;
  const x0 = FRAME_X0;
  const x1 = L * G - FRAME_X0;
  const d = LOG_W * 1.05;
  const parts: Part[] = [
    rbox(x0 - JAMB, x1 + JAMB, 0, 0.1, -d / 2 - 0.03, d / 2 + 0.03, 'white'),
    rbox(x0 - JAMB, x1 + JAMB, H - 0.1, H, -d / 2, d / 2, 'white'),
    rbox(x0 - JAMB, x0 + POST, 0.1, H - 0.1, -d / 2, d / 2, 'white'),
    rbox(x1 - POST, x1 + JAMB, 0.1, H - 0.1, -d / 2, d / 2, 'white')
  ];
  const i0 = x0 + POST;
  const i1 = x1 - POST;
  const j0 = 0.1;
  const j1 = H - 0.1;
  const bar = 0.025;
  for (let i = 1; i < 5; i++) {
    const x = i0 + ((i1 - i0) * i) / 5;
    parts.push(rbox(x - bar / 2, x + bar / 2, j0, j1, -bar / 2, bar / 2, 'dark', 0));
  }
  for (let j = 1; j < 4; j++) {
    const y = j0 + ((j1 - j0) * j) / 4;
    parts.push(rbox(i0, i1, y - bar / 2, y + bar / 2, -bar / 2, bar / 2, 'dark', 0));
  }
  // red shutters folded back against the outside face (+z), with a little fir tree cut out
  const sw = (i1 - i0) / 2 + 0.03;
  const sh = H - 0.14;
  const t = 0.05;
  const zf = d / 2 + 0.03;
  const fold = Math.PI - 0.28;
  parts.push(
    hingedLeaf(panel(0, sw, sh, treeHole(sw / 2, sh * 0.6, 0.16)), t, 'red', [x0 - JAMB, 0.07, zf], fold, 1),
    hingedLeaf(panel(-sw, 0, sh, treeHole(-sw / 2, sh * 0.6, 0.16)), t, 'red', [x1 + JAMB, 0.07, zf], fold, -1)
  );
  return parts;
}

// ---------------------------------------------------------------------------
// Roof: notched gables, battens, planks, ridge, chimney
// ---------------------------------------------------------------------------

const A = SLOPE_ANGLE;
const SA = Math.sin(A);
const CA = Math.cos(A);

function gableParts(W: number): Part[] {
  // thick board (like a log), notches perpendicular to the slope for the beams,
  // notched underneath at the corners
  const Hg = gableHeight(W);
  const Ww = W * G;
  const run = Ww / 2 + GABLE_C;
  const w2 = LOG_W / 2;
  const half = BATTEN_W / 2;
  const s = new Shape();
  s.moveTo(-GABLE_C, 0);
  for (const cx of [0, Ww]) {
    s.lineTo(cx - w2, 0);
    s.lineTo(cx - w2, Q);
    s.lineTo(cx + w2, Q);
    s.lineTo(cx + w2, 0);
  }
  s.lineTo(Ww + GABLE_C, 0);
  // right slope, going up: tangent (-cos, sin), inward normal (-sin, -cos)
  for (const f of BATTEN_F) {
    const px = Ww + GABLE_C - f * run;
    const py = f * Hg;
    const a: [number, number] = [px + CA * half, py - SA * half];
    const b: [number, number] = [px - CA * half, py + SA * half];
    s.lineTo(a[0], a[1]);
    s.lineTo(a[0] - SA * BATTEN_NOTCH, a[1] - CA * BATTEN_NOTCH);
    s.lineTo(b[0] - SA * BATTEN_NOTCH, b[1] - CA * BATTEN_NOTCH);
    s.lineTo(b[0], b[1]);
  }
  s.lineTo(Ww / 2, Hg);
  // left slope, going down: tangent (cos, sin), inward normal (sin, -cos)
  for (const f of [...BATTEN_F].reverse()) {
    const [px, py] = slopePoint(W, f);
    const a: [number, number] = [px + CA * half, py + SA * half];
    const b: [number, number] = [px - CA * half, py - SA * half];
    s.lineTo(a[0], a[1]);
    s.lineTo(a[0] + SA * BATTEN_NOTCH, a[1] - CA * BATTEN_NOTCH);
    s.lineTo(b[0] + SA * BATTEN_NOTCH, b[1] - CA * BATTEN_NOTCH);
    s.lineTo(b[0], b[1]);
  }
  s.closePath();
  const hole = new Path();
  hole.absarc(Ww / 2, Hg * 0.45, 0.15, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return [extrude(s, GABLE_T, 'yellow', undefined, 0.02)];
}

function battenParts(W: number, D: number, side: number, slot: number): Part[] {
  // orange square beam with sharp edges, tilted with the slope, from one gable to the other
  const p = battenPose(W, side, slot);
  return [rboxAt([BATTEN_W, BATTEN_W, battenLength(D)], [p.x, p.y, 0], [0, 0, p.rotZ], 'orange', 0)];
}

function plankParts(W: number, side: number, width = PLANK_W - 0.012): Part[] {
  const Hg = gableHeight(W);
  const Ww = W * G;
  const run = Ww / 2 + GABLE_C;
  const Lsl = run / CA;
  const over = 0.04;
  const Lp = Lsl + EAVE + over;
  const dist = Lp / 2 - over;
  const sx = side < 0 ? -1 : 1;
  // center on the gable line, shifted along the outward normal (half-plank)
  const mx = Ww / 2 + sx * CA * dist;
  const my = Hg - SA * dist;
  const off = ROOF_LIFT + PLANK_T / 2;
  const cx = mx + sx * SA * off;
  const cy = my + CA * off;
  const rot = -sx * A;
  // local x of a point located s below the ridge (local +x = uphill on the left, downhill on the right)
  const localX = (s: number) => (sx < 0 ? dist - s : s - dist);
  // two grooves underneath, facing the beams
  const grooves = BATTEN_F.map((f) => localX((1 - f) * Lsl))
    .map((x) => [x - BATTEN_W / 2 - 0.01, x + BATTEN_W / 2 + 0.01] as const)
    .sort((a, b) => a[0] - b[0]);
  // one piece: profile (length × thickness) with the 2 grooves underneath, extruded across the width
  const T2 = PLANK_T / 2;
  const prof = new Shape();
  prof.moveTo(-Lp / 2, -T2);
  for (const [g0, g1] of grooves) {
    prof.lineTo(g0, -T2);
    prof.lineTo(g0, -T2 + PLANK_GROOVE);
    prof.lineTo(g1, -T2 + PLANK_GROOVE);
    prof.lineTo(g1, -T2);
  }
  prof.lineTo(Lp / 2, -T2);
  prof.lineTo(Lp / 2, T2);
  prof.lineTo(-Lp / 2, T2);
  prof.closePath();
  return [extrude(prof, width, 'green', mat([cx, cy, 0], [0, 0, rot]), 0.015)];
}

function ridgeApex(W: number) {
  return gableHeight(W) + (ROOF_LIFT + PLANK_T) / CA;
}

const RIDGE_T = 0.11;
const RIDGE_ARM = 0.42;

function ridgeParts(W: number, units: number): Part[] {
  // solid red right angle (L) placed astride the ridge, with a small groove inside the apex
  const apex = ridgeApex(W);
  const w = RIDGE_ARM;
  const T = RIDGE_T / CA;
  const g = 0.04;
  const s = new Shape();
  s.moveTo(-w, -w * SLOPE);
  s.lineTo(-g, -g * SLOPE);
  s.lineTo(-g, g);
  s.lineTo(g, g);
  s.lineTo(g, -g * SLOPE);
  s.lineTo(w, -w * SLOPE);
  s.lineTo(w, -w * SLOPE + T);
  s.lineTo(0, T);
  s.lineTo(-w, -w * SLOPE + T);
  s.closePath();
  return [extrude(s, (units * PLANK_W) / RIDGE_DIV - 0.015, 'red', mat([(W * G) / 2, apex, 0]), 0.01)];
}

function chimneyParts(W: number): Part[] {
  // red block with a V cut underneath, astride the ridge cap
  const top = ridgeApex(W) + RIDGE_T / CA;
  const h = 0.28;
  const s = new Shape();
  s.moveTo(-h, top - h * SLOPE);
  s.lineTo(0, top);
  s.lineTo(h, top - h * SLOPE);
  s.lineTo(h, top + 0.5);
  s.lineTo(-h, top + 0.5);
  s.closePath();
  return [extrude(s, 0.5, 'red', mat([(W * G) / 2, 0, 0]), 0.02)];
}

// ---------------------------------------------------------------------------
// Floor & decor
// ---------------------------------------------------------------------------

function floorParts(L: number, D: number): Part[] {
  // single green board, with notches at the back corners to fit around the logs
  const x0 = -0.3;
  const x1 = L * G + 0.3;
  const z0 = -0.3;
  const z1 = D * G + 0.3;
  const n = 0.2;
  const s = new Shape();
  s.moveTo(x0, z0);
  s.lineTo(x1, z0);
  s.lineTo(x1, z1 - n);
  s.lineTo(x1 - n, z1 - n);
  s.lineTo(x1 - n, z1);
  s.lineTo(x0 + n, z1);
  s.lineTo(x0 + n, z1 - n);
  s.lineTo(x0, z1 - n);
  s.closePath();
  // rotation +90° around X: shape y → world +z, thickness along y
  return [extrude(s, Q, 'green', mat([0, Q / 2, 0], [Math.PI / 2, 0, 0]), 0.015)];
}

function treeParts(): Part[] {
  // a thick board cut into a fir tree, held up by a small crosswise foot
  const s = new Shape();
  const k = 0.62;
  const pts: [number, number][] = (
    [
      [0.14, 0],
      [0.14, 0.2],
      [0.8, 0.2],
      [0.4, 0.92],
      [0.62, 0.92],
      [0.3, 1.62],
      [0.46, 1.62],
      [0, 2.6]
    ] as [number, number][]
  ).map(([x, y]) => [x * k, y * k]);
  s.moveTo(-pts[0][0], pts[0][1]);
  for (const [x, y] of pts) s.lineTo(x, y);
  for (let i = pts.length - 2; i >= 0; i--) s.lineTo(-pts[i][0], pts[i][1]);
  s.closePath();
  const foot = new Shape();
  foot.moveTo(-0.32, 0);
  foot.lineTo(0.32, 0);
  foot.lineTo(0.2, 0.2);
  foot.lineTo(-0.2, 0.2);
  foot.closePath();
  return [
    extrude(s, 0.16, 'green', undefined, 0.02),
    extrude(foot, 0.07, 'green', mat([0, 0, 0], [0, Math.PI / 2, 0]), 0.015)
  ];
}

function figurineParts(): Part[] {
  const parts: Part[] = [];
  const cyl = (r: number, h: number, c: [number, number, number], paint: Paint, rot?: [number, number, number]) =>
    parts.push({ geo: finalize(new CylinderGeometry(r, r, h, 16), mat(c, rot)), paint });
  const sph = (r: number, c: [number, number, number], paint: Paint, phiLen = Math.PI) =>
    parts.push({
      geo: finalize(new SphereGeometry(r, 20, 14, 0, Math.PI * 2, 0, phiLen), mat(c)),
      paint
    });
  cyl(0.075, 0.4, [-0.085, 0.2, 0], 'blue');
  cyl(0.075, 0.4, [0.085, 0.2, 0], 'blue');
  parts.push(rbox(-0.19, 0.19, 0.38, 0.74, -0.12, 0.12, 'red', 0.06));
  cyl(0.055, 0.34, [-0.24, 0.56, 0], 'red', [0, 0, 0.12]);
  cyl(0.055, 0.34, [0.24, 0.56, 0], 'red', [0, 0, -0.12]);
  sph(0.05, [-0.27, 0.38, 0], 'skin');
  sph(0.05, [0.27, 0.38, 0], 'skin');
  sph(0.16, [0, 0.9, 0], 'skin');
  sph(0.168, [0, 0.92, -0.01], 'hair', Math.PI * 0.45);
  sph(0.022, [-0.055, 0.92, 0.145], 'dark');
  sph(0.022, [0.055, 0.92, 0.145], 'dark');
  return parts;
}

// ---------------------------------------------------------------------------

const cache = new Map<string, PieceGeometry>();

type GeoSpec = Pick<PieceSpec, 'type' | 'param' | 'param2' | 'side' | 'slot'>;

export function geometryKey(spec: GeoSpec): string {
  const def = getDef(spec.type);
  switch (def.kind) {
    case 'batten':
      return `${spec.type}:${spec.param}:${spec.side ?? 1}:${spec.slot ?? 0}`;
    case 'roof':
      return `${spec.type}:${spec.param}:${spec.side ?? 1}`;
    case 'chimney':
      return `${spec.type}:${spec.param}`;
    case 'ridge':
      return `${spec.type}:${spec.param}`;
    default:
      return spec.type;
  }
}

export function getGeometry(spec: GeoSpec): PieceGeometry {
  const key = geometryKey(spec);
  let g = cache.get(key);
  if (g) return g;
  const def = getDef(spec.type);
  let parts: Part[];
  switch (def.kind) {
    case 'log':
      parts = logParts(def.notches ?? [0], def.h, def.topNotch, def.bottomNotch);
      break;
    case 'insert':
      parts = spec.type === 'door' ? doorParts(def.length, def.h) : windowParts(def.length, def.h);
      break;
    case 'gable':
      parts = gableParts(def.length);
      break;
    case 'batten':
      parts = battenParts(spec.param ?? 5, def.length, spec.side ?? 1, spec.slot ?? 0);
      break;
    case 'roof':
      parts = plankParts(spec.param ?? 5, spec.side ?? 1);
      break;
    case 'ridge':
      parts = ridgeParts(spec.param ?? 5, def.length);
      break;
    case 'chimney':
      parts = chimneyParts(spec.param ?? 5);
      break;
    case 'floor':
      parts = floorParts(def.length, def.depth);
      break;
    case 'decor':
      parts = spec.type === 'tree' ? treeParts() : figurineParts();
      break;
  }
  g = mergeParts(parts);
  cache.set(key, g);
  return g;
}

const pickCache = new Map<string, BufferGeometry>();

/** Invisible surface covering a whole roof slope (raycast target for roof pieces). */
export function roofPickGeometry(W: number, n: number, side: number): BufferGeometry {
  const key = `${W}:${n}:${side}`;
  let g = pickCache.get(key);
  if (!g) {
    g = mergeParts(plankParts(W, side, n * PLANK_W)).geometry;
    pickCache.set(key, g);
  }
  return g;
}
