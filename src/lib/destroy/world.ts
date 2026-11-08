import type RAPIER from '@dimforge/rapier3d-compat';
import type { Collider, ImpulseJoint, RigidBody, Shape } from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import type { PlacedPiece } from '../build/grid';
import { Q } from '../build/grid';
import { centerOf, transformOf } from '../build/transform';
import { isUpsideDown, localBoxes } from '../build/volumes';
import { getDef, isRoofKind } from '../pieces/catalog';
import { geometryKey, getGeometry } from '../pieces/geometry';

export type Rapier = typeof RAPIER;
export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

/** "Toy" gravity: a bit stronger than real life, the falls are snappier. */
export const GRAVITY = 9.81 * 1.6;
const STEP = 1 / 60;
/** Catching up after a slow frame: at most 2 steps (beyond that, the simulation slows down
 * rather than taking even longer to compute — the spiral that kills the frame rate). */
const MAX_STEPS = 2;
/** Colliders are shrunk a little so pieces that touch don't start interpenetrating. */
const SKIN = 0.0012;
/** Shrink of the probe shapes used to find the pieces that really overlap at the start. */
const PROBE = 0.012;
/** Growth of the probe shapes used to find the pieces that touch. */
const TOUCH = 0.02;
const DENSITY = 1;

export interface Debris {
  piece: PlacedPiece;
  body: RigidBody;
  home: { p: Vec3; q: Quat };
  /** Height of the piece's center in the chalet (rebuild order, tornado). */
  homeY: number;
  mass: number;
  /** Simulated (otherwise frozen in place, as part of the standing chalet). */
  active: boolean;
  /** Fell off the table: disabled and hidden. */
  lost: boolean;
  /** Pieces it touches (resting on it or under it). */
  neighbors: Debris[];
  /** Index in `DemoWorld.debris`. */
  index: number;
  colliders: Collider[];
}

/** A continuous effect (tornado, quake): called on every physics step; returns false when it's over. */
export interface Field {
  update(world: DemoWorld, h: number, time: number): boolean;
}

export type Surface = 'wood' | 'table';

/** A piece hitting something: the start of a contact. */
export interface Impact {
  /** The piece that hit (the faster one). */
  d: Debris;
  /** Speed at which the two met, along the contact normal (m/s). */
  speed: number;
  /** Heaviest of the two pieces (the table doesn't count). */
  mass: number;
  surface: Surface;
}

/** Sliding contacts (pieces rubbing on each other or on the table), summed over a step. */
export interface Slide {
  /** ~ pressure x sliding speed, summed over the contacts. */
  power: number;
  /** Average sliding speed (m/s). */
  speed: number;
  /** Where (average position of the contacts). */
  x: number;
  y: number;
  z: number;
}

export interface WorldOptions {
  /** Called for the strongest impacts of each step. */
  onImpact?: (e: Impact) => void;
}

const emptySlide = (): Slide => ({ power: 0, speed: 0, x: 0, y: 0, z: 0 });

const hullCache = new Map<string, Float32Array>();

/** Vertices of a piece's geometry (deduplicated), slightly pulled toward the center. */
function hullPoints(piece: PlacedPiece): Float32Array {
  const key = geometryKey(piece);
  let pts = hullCache.get(key);
  if (pts) return pts;
  const pos = getGeometry(piece).geometry.attributes.position;
  const seen = new Set<string>();
  const out: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = `${Math.round(x * 500)},${Math.round(y * 500)},${Math.round(z * 500)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x, y, z);
  }
  pts = scaled(new Float32Array(out), 0.985);
  hullCache.set(key, pts);
  return pts;
}

/** Points scaled by `s` around their centroid. */
function scaled(points: Float32Array, s: number): Float32Array {
  let cx = 0;
  let cy = 0;
  let cz = 0;
  const n = points.length / 3 || 1;
  for (let i = 0; i < points.length; i += 3) {
    cx += points[i];
    cy += points[i + 1];
    cz += points[i + 2];
  }
  cx /= n;
  cy /= n;
  cz /= n;
  const out = new Float32Array(points.length);
  for (let i = 0; i < points.length; i += 3) {
    out[i] = cx + (points[i] - cx) * s;
    out[i + 1] = cy + (points[i + 1] - cy) * s;
    out[i + 2] = cz + (points[i + 2] - cz) * s;
  }
  return out;
}

const qa = new Quaternion();
const qb = new Quaternion();

const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

interface Probe {
  collider: Collider;
  d: Debris;
  /** Shrunk shape: what really overlaps. */
  overlap: Shape;
  /** Grown shape: what touches. */
  touch: Shape;
}

/**
 * Physics world of a demolition: one body per piece. Every piece starts frozen (fixed),
 * so the chalet stands perfectly still; an effect or a flying piece "activates" pieces,
 * and everything resting on an active piece is activated in turn (it may fall).
 */
export class DemoWorld {
  readonly R: Rapier;
  readonly world: RAPIER.World;
  readonly floor: RigidBody;
  readonly debris: Debris[] = [];
  /** Center of the chalet at about a third of its height (where the big explosion goes off). */
  readonly center: Vec3;
  /** Top of the chalet. */
  readonly top: number;
  time = 0;
  fields: Field[] = [];

  #acc = 0;
  #byBody = new Map<number, Debris>();
  /** Collider handle -> piece (contact events give collider handles: no round trip to the engine). */
  #byCollider = new Map<number, Debris>();
  #floorCollider: number;
  /** Pieces whose colliders go through the contact filter (calling it costs: only those that need it). */
  #hooked = new Set<Debris>();
  #excluded = new Set<string>();
  /** Pairs that ignore each other until a given time (`unlock`). */
  #unlocked = new Map<string, number>();
  #pairs: [Debris, Debris][] = [];
  #joints = new Map<Debris, Set<ImpulseJoint>>();
  /** Speed of the glued pieces before the current step. */
  #speed = new Map<Debris, number>();
  /** Velocities of the pieces before the current step (x, y, z per piece). */
  #vel: Float32Array = new Float32Array(0);
  /**
   * Poses before and after the last physics step (position x3 + rotation x4 per piece), for
   * drawing in between: the physics runs at 60 steps per game second, the screen can show
   * more frames than that (slow motion: one step every ~7 frames; 120/144 Hz screens).
   */
  #prev: Float32Array = new Float32Array(0);
  #cur: Float32Array = new Float32Array(0);
  /** Pairs in contact at the previous step (a pair that wasn't is a new impact). */
  #touching = new Set<string>();
  /** Sliding contacts of the last step, between pieces and on the table. */
  readonly slide: Record<Surface, Slide> = { wood: emptySlide(), table: emptySlide() };
  #events: RAPIER.EventQueue;
  #hooks: RAPIER.PhysicsHooks;
  #opts: WorldOptions;

  constructor(R: Rapier, pieces: PlacedPiece[], opts: WorldOptions = {}) {
    this.R = R;
    this.#opts = opts;
    this.world = new R.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = STEP;
    // 4 iterations (Rapier's default): with only 2, the piles of interlocked logs left after
    // a collapse never settle — they jitter, hop and "dance" instead of falling asleep
    // (measured: ~10x fewer restless pieces a few seconds after a bomb or a quake, for a
    // step cost that barely changes)
    this.world.numSolverIterations = 4;
    this.#events = new R.EventQueue(true);

    // floor: kinematic so the quake can shake it
    this.floor = this.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(1.5, -1, 1.5));
    this.#floorCollider = this.world.createCollider(
      R.ColliderDesc.cuboid(60, 1, 60).setFriction(0.9).setRestitution(0.1),
      this.floor
    ).handle;

    const probes: Probe[] = [];
    const grown = (h: Vec3, m: number) => new R.Cuboid(...(h.map((v) => Math.max(v + m, 0.002)) as Vec3));
    const shrunk = (h: Vec3) => h.map((v) => Math.max(v - SKIN, 0.004)) as Vec3;
    let sx = 0;
    let sz = 0;
    let top = 0;
    for (const piece of pieces) {
      const t = transformOf(piece);
      const half = t.rotationY / 2;
      const q: Quat = [0, Math.sin(half), 0, Math.cos(half)];
      const body = this.world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(...t.position)
          .setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] })
          .setLinearDamping(0.05)
          .setAngularDamping(0.25)
          .setCcdEnabled(true)
      );
      const c = centerOf(piece);
      const d: Debris = {
        piece,
        body,
        home: { p: [...t.position], q },
        homeY: c[1],
        mass: 0,
        active: false,
        lost: false,
        neighbors: [],
        index: this.debris.length,
        colliders: []
      };
      sx += c[0];
      sz += c[2];

      const def = getDef(piece.type);
      const boxes = isRoofKind(def.kind) ? [] : localBoxes(piece.type, isUpsideDown(piece));
      const descs: { desc: RAPIER.ColliderDesc; overlap: Shape; touch: Shape }[] = [];
      if (boxes.length) {
        // logs, gables, floors…: the same boxes as the stacking solver, notches included
        for (const b of boxes) {
          const h: Vec3 = [(b.x1 - b.x0) / 2, ((b.y1 - b.y0) * Q) / 2, (b.z1 - b.z0) / 2];
          const desc = R.ColliderDesc.cuboid(...shrunk(h)).setTranslation(
            (b.x0 + b.x1) / 2,
            ((b.y0 + b.y1) * Q) / 2,
            (b.z0 + b.z1) / 2
          );
          descs.push({ desc, overlap: grown(h, -PROBE), touch: grown(h, TOUCH) });
          top = Math.max(top, (piece.y + b.y1) * Q);
        }
      } else {
        // roof elements: convex hull of the mesh; anything they touch counts as
        // overlapping, so the roof is glued as a whole
        const pts = hullPoints(piece);
        const desc = R.ColliderDesc.convexHull(pts);
        const probe = R.ColliderDesc.convexHull(scaled(pts, 1.03));
        if (desc && probe) descs.push({ desc, overlap: probe.shape, touch: probe.shape });
        else {
          const g = getGeometry(piece).geometry;
          if (!g.boundingBox) g.computeBoundingBox();
          const bb = g.boundingBox!;
          const h: Vec3 = [(bb.max.x - bb.min.x) / 2, (bb.max.y - bb.min.y) / 2, (bb.max.z - bb.min.z) / 2];
          descs.push({
            desc: R.ColliderDesc.cuboid(...shrunk(h)).setTranslation(
              (bb.min.x + bb.max.x) / 2,
              (bb.min.y + bb.max.y) / 2,
              (bb.min.z + bb.max.z) / 2
            ),
            overlap: grown(h, -PROBE),
            touch: grown(h, TOUCH)
          });
        }
        top = Math.max(top, c[1] + 0.5);
      }

      for (const { desc, overlap, touch } of descs) {
        desc
          .setDensity(DENSITY)
          .setFriction(0.7)
          .setRestitution(0.15)
          .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS);
        const collider = this.world.createCollider(desc, body);
        probes.push({ collider, d, overlap, touch });
        d.colliders.push(collider);
        this.#byCollider.set(collider.handle, d);
      }
      d.mass = body.mass();
      // low threshold: resting and sliding contacts are reported too (friction sounds)
      for (let i = 0; i < body.numColliders(); i++) body.collider(i).setContactForceEventThreshold(d.mass * 4);
      body.setBodyType(R.RigidBodyType.Fixed, false);
      this.debris.push(d);
      this.#byBody.set(body.handle, d);
    }

    this.#vel = new Float32Array(this.debris.length * 3);
    this.#cur = new Float32Array(this.debris.length * 7);
    for (const d of this.debris) this.#cur.set([...d.home.p, ...d.home.q], d.index * 7);
    this.#prev = this.#cur.slice();
    const n = Math.max(1, pieces.length);
    this.top = top;
    this.center = [sx / n, Math.max(0.3, top * 0.3), sz / n];
    this.#probe(probes);
    this.#glue();

    const SOLVE = R.SolverFlags.COMPUTE_IMPULSE;
    const excluded = this.#excluded;
    const unlocked = this.#unlocked;
    this.#hooks = {
      filterContactPair: (_c1, _c2, b1, b2) => {
        const key = pairKey(b1, b2);
        if (excluded.has(key)) return null;
        const until = unlocked.get(key);
        if (until === undefined) return SOLVE;
        if (until > this.time) return null;
        unlocked.delete(key);
        return SOLVE;
      },
      filterIntersectionPair: () => true
    };
  }

  /**
   * Finds which pieces touch (activation spreads along those links) and which ones really
   * overlap (roof elements sitting in the gables, approximated shapes…): those would push
   * each other away violently, so they ignore each other for the whole demolition.
   */
  #probe(probes: Probe[]) {
    // one step to build the query structures (every piece is fixed: nothing moves)
    this.world.step();
    const touching = new Set<string>();
    const toHook = new Set<Debris>();
    for (const { collider, d, overlap, touch } of probes) {
      const query = (shape: Shape, f: (od: Debris) => void) =>
        this.world.intersectionsWithShape(
          collider.translation(),
          collider.rotation(),
          shape,
          (other) => {
            const ob = other.parent();
            const od = ob ? this.#byBody.get(ob.handle) : undefined;
            if (od && od !== d) f(od);
            return true;
          },
          undefined,
          undefined,
          undefined,
          d.body
        );
      query(touch, (od) => {
        const key = pairKey(d.body.handle, od.body.handle);
        if (touching.has(key)) return;
        touching.add(key);
        d.neighbors.push(od);
        od.neighbors.push(d);
      });
      query(overlap, (od) => {
        const key = pairKey(d.body.handle, od.body.handle);
        if (!this.#excluded.has(key)) this.#pairs.push([d, od]);
        this.#excluded.add(key);
        toHook.add(d);
        toHook.add(od);
      });
    }
    // (not inside the queries: the engine is borrowed while they run)
    for (const d of toHook) this.#hook(d);
  }

  /** Makes the contacts of a piece go through the filter (overlapping or unlocked pairs). */
  #hook(d: Debris) {
    if (this.#hooked.has(d)) return;
    this.#hooked.add(d);
    for (const c of d.colliders) c.setActiveHooks(this.R.ActiveHooks.FILTER_CONTACT_PAIRS);
  }

  /**
   * Interlocked pieces (the roof elements in the gables' notches…) can't rest on each other
   * since they ignore each other: they're glued with fixed joints instead, until an effect
   * or a hard impact tears them apart (`release`).
   */
  #glue() {
    const R = this.R;
    const qa = new Quaternion();
    const qb = new Quaternion();
    const v = new Vector3();
    for (const [a, b] of this.#pairs) {
      const ta = a.body.translation();
      const tb = b.body.translation();
      const ra = a.body.rotation();
      const rb = b.body.rotation();
      qa.set(ra.x, ra.y, ra.z, ra.w).invert();
      qb.set(rb.x, rb.y, rb.z, rb.w).invert();
      // anchor at b's origin, frames = the world frame seen from each body
      v.set(tb.x - ta.x, tb.y - ta.y, tb.z - ta.z).applyQuaternion(qa);
      const joint = this.world.createImpulseJoint(
        R.JointData.fixed(
          { x: v.x, y: v.y, z: v.z },
          { x: qa.x, y: qa.y, z: qa.z, w: qa.w },
          { x: 0, y: 0, z: 0 },
          { x: qb.x, y: qb.y, z: qb.z, w: qb.w }
        ),
        a.body,
        b.body,
        false
      );
      for (const d of [a, b]) {
        let set = this.#joints.get(d);
        if (!set) this.#joints.set(d, (set = new Set()));
        set.add(joint);
      }
    }
  }

  /**
   * Unfreezes a piece, and with it everything that rests on it (directly or not) and
   * everything glued to it: whatever loses its support falls.
   * `loosen`: also unfreezes the pieces it touches below / beside it — a frozen piece
   * is an immovable anchor, its notches would keep the piece from being pushed away.
   */
  activate(d: Debris, loosen = false) {
    if (d.lost) return;
    const queue = [d];
    if (loosen) for (const n of d.neighbors) if (!n.active) queue.push(n);
    if (d.active && !loosen) return;
    while (queue.length) {
      const e = queue.pop()!;
      if (e.active) continue;
      e.active = true;
      e.body.setBodyType(this.R.RigidBodyType.Dynamic, true);
      // (otherwise the mass is only known at the next step: an impulse given now would be lost)
      e.body.recomputeMassPropertiesFromColliders();
      for (const n of e.neighbors) if (!n.active && n.homeY > e.homeY + 0.01) queue.push(n);
      const joints = this.#joints.get(e);
      if (joints)
        for (const j of joints) {
          if (!j.isValid()) continue;
          for (const b of [j.body1(), j.body2()]) {
            const o = this.#byBody.get(b.handle);
            if (o && !o.active) queue.push(o);
          }
        }
    }
  }

  /**
   * The wood breaks: for `seconds`, the piece goes through the pieces it was interlocked
   * with, so a blast can tear it out of its notches (they would otherwise hold the whole
   * chalet together and absorb the push).
   */
  unlock(d: Debris, seconds: number) {
    const until = this.time + seconds;
    this.#hook(d);
    for (const n of d.neighbors) this.#unlocked.set(pairKey(d.body.handle, n.body.handle), until);
  }

  /** Tears a piece away from the pieces it's glued to. */
  release(d: Debris) {
    const set = this.#joints.get(d);
    if (!set) return;
    for (const j of set) {
      if (!j.isValid()) continue;
      for (const other of [j.body1(), j.body2()]) {
        const od = this.#byBody.get(other.handle);
        if (od && od !== d) this.#joints.get(od)?.delete(j);
      }
      this.world.removeImpulseJoint(j, true);
    }
    this.#joints.delete(d);
    this.#speed.delete(d);
  }

  /** Number of glue joints left. */
  get glued(): number {
    let n = 0;
    for (const s of this.#joints.values()) n += s.size;
    return n / 2;
  }

  #savePoses() {
    this.#prev.set(this.#cur);
    for (const d of this.debris) {
      if (!d.active || d.lost) continue;
      const t = d.body.translation();
      const r = d.body.rotation();
      const i = d.index * 7;
      const c = this.#cur;
      c[i] = t.x;
      c[i + 1] = t.y;
      c[i + 2] = t.z;
      c[i + 3] = r.x;
      c[i + 4] = r.y;
      c[i + 5] = r.z;
      c[i + 6] = r.w;
    }
  }

  /**
   * Pose of a piece to draw now: between the last two physics steps, according to the time
   * left over (no stutter in slow motion or on fast screens).
   */
  pose(d: Debris, outP: Vector3, outQ: Quaternion) {
    const k = Math.min(1, this.#acc / STEP);
    const i = d.index * 7;
    const a = this.#prev;
    const b = this.#cur;
    outP.set(a[i] + (b[i] - a[i]) * k, a[i + 1] + (b[i + 1] - a[i + 1]) * k, a[i + 2] + (b[i + 2] - a[i + 2]) * k);
    qa.set(a[i + 3], a[i + 4], a[i + 5], a[i + 6]);
    qb.set(b[i + 3], b[i + 4], b[i + 5], b[i + 6]);
    outQ.slerpQuaternions(qa, qb, k);
  }

  addField(f: Field) {
    this.fields.push(f);
  }

  /** Advances the simulation by `dt` seconds of game time (already slowed down if needed). */
  step(dt: number) {
    this.#acc += Math.min(dt, STEP * MAX_STEPS);
    let n = 0;
    while (this.#acc >= STEP && n < MAX_STEPS) {
      this.#acc -= STEP;
      n++;
      this.time += STEP;
      this.fields = this.fields.filter((f) => f.update(this, STEP, this.time));
      for (const d of this.#joints.keys()) {
        const v = d.body.linvel();
        this.#speed.set(d, Math.hypot(v.x, v.y, v.z));
      }
      for (const d of this.debris) {
        if (!d.active || d.lost) continue;
        const v = d.body.linvel();
        this.#vel[d.index * 3] = v.x;
        this.#vel[d.index * 3 + 1] = v.y;
        this.#vel[d.index * 3 + 2] = v.z;
      }
      this.world.step(this.#events, this.#hooks);
      this.#drainImpacts();
      this.#savePoses();
    }
    // too far behind (very slow frame): drop the rest rather than catching up forever
    if (this.#acc > STEP) this.#acc = STEP;
    for (const d of this.debris) {
      if (!d.active || d.lost) continue;
      if (d.body.worldCom().y < -4) {
        d.lost = true;
        d.body.setEnabled(false);
      }
    }
  }

  /** Velocity of a piece before the step (zero for the table or a frozen piece). */
  #before(d: Debris | undefined): [number, number, number] {
    if (!d || !d.active) return [0, 0, 0];
    const i = d.index * 3;
    return [this.#vel[i], this.#vel[i + 1], this.#vel[i + 2]];
  }

  #drainImpacts() {
    const impacts: Impact[] = [];
    const torn: Debris[] = [];
    const woken: Debris[] = [];
    const touching = new Set<string>();
    const slide = { wood: emptySlide(), table: emptySlide() };
    const floorC = this.#floorCollider;
    const floorB = this.floor.handle;

    this.#events.drainContactForceEvents((e) => {
      const c1 = e.collider1();
      const c2 = e.collider2();
      const d1 = this.#byCollider.get(c1);
      const d2 = this.#byCollider.get(c2);
      if ((!d1 && c1 !== floorC) || (!d2 && c2 !== floorC)) return;
      const force = e.totalForceMagnitude();

      for (const [d, o] of [
        [d1, d2],
        [d2, d1]
      ]) {
        if (!d) continue;
        const i = Math.min(1, force / (d.mass * 900));
        // hit hard by a flying piece: a frozen piece comes to life
        if (!d.active && o?.active && i > 0.12) woken.push(d);
        // a glued piece slamming into something at speed breaks loose
        if (i > 0.45 && (this.#speed.get(d) ?? 0) > 1.5) torn.push(d);
      }

      if (!d1?.active && !d2?.active) return;
      const surface: Surface = d1 && d2 ? 'wood' : 'table';
      // contact normal ~ direction of the contact force
      const f = e.totalForce();
      const fl = Math.hypot(f.x, f.y, f.z) || 1;
      const nx = f.x / fl;
      const ny = f.y / fl;
      const nz = f.z / fl;

      // impact: how fast the two were coming at each other, along the normal, before the step
      const v1 = this.#before(d1);
      const v2 = this.#before(d2);
      const approach = Math.abs((v1[0] - v2[0]) * nx + (v1[1] - v2[1]) * ny + (v1[2] - v2[2]) * nz);
      const key = pairKey(d1 ? d1.body.handle : floorB, d2 ? d2.body.handle : floorB);
      touching.add(key);
      const isNew = !this.#touching.has(key);
      // a new contact, or a contact that already existed but takes a real blow
      if ((isNew && approach > 0.15) || approach > 1) {
        const s1 = Math.hypot(...v1);
        const s2 = Math.hypot(...v2);
        const d = (s1 >= s2 ? d1 : d2) ?? d1 ?? d2!;
        impacts.push({ d, speed: approach, mass: Math.max(d1?.mass ?? 0, d2?.mass ?? 0), surface });
        return;
      }

      // ongoing contact: sliding (relative velocity now, minus its normal part)
      const a1 = d1?.active ? d1.body.linvel() : { x: 0, y: 0, z: 0 };
      const a2 = d2?.active ? d2.body.linvel() : { x: 0, y: 0, z: 0 };
      const rx = a1.x - a2.x;
      const ry = a1.y - a2.y;
      const rz = a1.z - a2.z;
      const rn = rx * nx + ry * ny + rz * nz;
      const vt = Math.hypot(rx - rn * nx, ry - rn * ny, rz - rn * nz);
      if (vt < 0.05) return;
      const m = Math.max(d1?.mass ?? 0, d2?.mass ?? 0);
      // pressure relative to the weight of the piece (lying flat = 1), capped
      const pressure = Math.min(3, force / (m * GRAVITY));
      const w = pressure * Math.min(vt, 3) * Math.sqrt(m);
      const sl = slide[surface];
      const c = (d1?.active ? d1 : d2!).body.worldCom();
      sl.power += w;
      sl.speed += vt * w;
      sl.x += c.x * w;
      sl.y += c.y * w;
      sl.z += c.z * w;
    });

    this.#touching = touching;
    for (const k of ['wood', 'table'] as const) {
      const sl = slide[k];
      if (sl.power > 0) {
        sl.speed /= sl.power;
        sl.x /= sl.power;
        sl.y /= sl.power;
        sl.z /= sl.power;
      }
      Object.assign(this.slide[k], sl);
    }
    for (const d of woken) this.activate(d);
    for (const d of torn) this.release(d);

    const cb = this.#opts.onImpact;
    if (!cb || !impacts.length) return;
    // the few strongest of the step (energy ~ mass x speed^2)
    impacts.sort((a, b) => b.mass * b.speed ** 2 - a.mass * a.speed ** 2);
    const seen = new Set<Debris>();
    for (const im of impacts) {
      if (seen.has(im.d)) continue;
      seen.add(im.d);
      cb(im);
      if (seen.size >= 4) break;
    }
  }

  dispose() {
    this.fields = [];
    this.#events.free();
    this.world.free();
  }
}
