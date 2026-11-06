import { emit, kick } from './fx';
import { GRAVITY, type DemoWorld, type Field, type Vec3 } from './world';

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * Explosion at `point`: each piece gets a velocity kick away from it (and upward),
 * fading with distance, plus a random spin. `radius` limits the blast (bombs).
 */
export function explode(w: DemoWorld, point: Vec3, power: number, radius = Infinity): number {
  const [px, py, pz] = point;
  let hit = 0;
  for (const d of w.debris) {
    if (d.lost) continue;
    const b = d.body;
    const c = b.worldCom();
    let dx = c.x - px;
    let dy = c.y - py;
    let dz = c.z - pz;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > radius) continue;
    if (dist < 1e-3) {
      dx = rand(-1, 1);
      dz = rand(-1, 1);
      dy = 0;
    }
    const n = Math.hypot(dx, dy, dz) || 1;
    dx /= n;
    dy /= n;
    dz /= n;
    // up-biased (a blast throws things in the air), and scattered: the interlocked
    // logs of a wall must not all get the same push, or the wall flies off in one block
    dy = dy * 0.45 + 0.55 + rand(-0.2, 0.25);
    dx += rand(-0.35, 0.35);
    dz += rand(-0.35, 0.35);
    const m = Math.hypot(dx, dy, dz);
    let falloff = 1 / (1 + (dist / (radius === Infinity ? 2.6 : 1.6)) ** 2);
    if (radius !== Infinity) {
      falloff *= 1 - dist / radius;
    }
    const dv = power * falloff * rand(0.55, 1.45);
    if (dv < 0.2) continue;
    w.activate(d, true);
    if (dv > 1.5) {
      w.release(d);
      w.unlock(d, 0.3);
    }
    const s = (d.mass * dv) / m;
    b.applyImpulse({ x: dx * s, y: dy * s, z: dz * s }, true);
    const inertia = b.principalInertia();
    const spin = dv * 1.4;
    b.applyTorqueImpulse(
      { x: inertia.x * rand(-spin, spin), y: inertia.y * rand(-spin, spin), z: inertia.z * rand(-spin, spin) },
      true
    );
    if (dv > 0.3) hit++;
  }
  return hit;
}

/**
 * Tornado: a vortex crosses the chalet. Pieces are pulled into a swirling updraft,
 * the top of the chalet first (the roof goes before the walls), then flung away.
 */
export function tornado(w: DemoWorld, duration = 5): Field {
  const [cx, , cz] = w.center;
  const a = Math.random() * Math.PI * 2;
  const ux = Math.cos(a);
  const uz = Math.sin(a);
  const span = 2.6;
  const R = 3.4;
  let t0: number | null = null;

  return {
    update(w, h, time) {
      t0 ??= time;
      const t = time - t0;
      if (t > duration) return false;
      const k = t / duration;
      const ax = cx + ux * (k * 2 - 1) * span + Math.sin(t * 2.1) * 0.35;
      const az = cz + uz * (k * 2 - 1) * span + Math.cos(t * 1.7) * 0.35;
      const ramp = Math.min(1, t / 1.2) * Math.min(1, (duration - t) / 0.7);
      // grabs the top of the chalet first, then lower and lower
      const reach = (w.top + 0.5) * Math.min(1, t / 2.4);
      const floorY = w.top - reach - 0.2;

      for (const d of w.debris) {
        if (d.lost) continue;
        const b = d.body;
        const c = b.worldCom();
        if (c.y < floorY) continue;
        const rx = c.x - ax;
        const rz = c.z - az;
        const r = Math.max(Math.hypot(rx, rz), 0.05);
        if (r > R) continue;
        const f = (1 - r / R) ** 0.6 * ramp;
        if (f < 0.05) continue;
        w.activate(d);
        if (f > 0.35) w.release(d);
        const nx = rx / r;
        const nz = rz / r;
        // wind: swirling, pulled inward, lifting (up to a ceiling)
        const wx = -nz * 9 * f - nx * 2.5 * f;
        const wz = nx * 9 * f - nz * 2.5 * f;
        const wy = (c.y < 5.5 ? 4.5 : -1) * f;
        const v = b.linvel();
        const drag = 2.6;
        const ix = (wx - v.x) * drag;
        const iy = (wy - v.y) * drag + GRAVITY * 0.8 * f;
        const iz = (wz - v.z) * drag;
        const s = d.mass * h;
        b.applyImpulse({ x: ix * s, y: iy * s, z: iz * s }, true);
        if (Math.random() < 0.04) {
          const inertia = b.principalInertia();
          const sp = 3 * f;
          b.applyTorqueImpulse(
            { x: inertia.x * rand(-sp, sp), y: inertia.y * rand(-sp, sp), z: inertia.z * rand(-sp, sp) },
            true
          );
        }
      }

      // the funnel: dust swirling up around the axis
      for (let i = 0; i < 3; i++) {
        const y = Math.random() ** 1.6 * 6;
        const rr = 0.25 + y * 0.28 + rand(-0.1, 0.1);
        const th = Math.random() * Math.PI * 2;
        const sp = 5 + y * 0.6;
        emit({
          kind: 'swirl',
          p: [ax + Math.cos(th) * rr, y, az + Math.sin(th) * rr],
          v: [-Math.sin(th) * sp, 1.5 + Math.random() * 1.5, Math.cos(th) * sp],
          size: (0.14 + y * 0.04) * ramp
        });
      }
      kick(0.006 * ramp);
      return true;
    }
  };
}

/**
 * Earthquake: the table shakes and the chalet collapses under its own weight.
 */
export function quake(w: DemoWorld, duration = 4): Field {
  const rest = w.floor.translation();
  const base = { x: rest.x, y: rest.y, z: rest.z };
  let t0: number | null = null;
  let nextJolt = 0;
  const [cx, , cz] = w.center;

  return {
    update(w, _h, time) {
      if (t0 === null) {
        t0 = time;
        for (const d of w.debris) w.activate(d);
      }
      const t = time - t0;
      if (t > duration) {
        w.floor.setNextKinematicTranslation(base);
        return false;
      }
      const env = Math.min(1, t / 0.35) * (1 - t / duration) ** 1.2;
      const A = 0.14 * env;
      const tau = Math.PI * 2;
      w.floor.setNextKinematicTranslation({
        x: base.x + A * Math.sin(tau * 4.3 * t),
        y: base.y + A * 0.3 * Math.max(0, Math.sin(tau * 6.7 * t)),
        z: base.z + A * 0.8 * Math.sin(tau * 3.1 * t + 1)
      });

      if (t >= nextJolt) {
        nextJolt = t + rand(0.1, 0.18);
        // after the first shocks, the roof comes loose
        if (t > 0.9) for (const d of w.debris) w.release(d);
        for (const d of w.debris) {
          if (d.lost) continue;
          const b = d.body;
          const c = b.worldCom();
          // jolts: the higher the piece, the more it sways
          let sway = (0.7 + c.y * 0.55) * env;
          let lift = rand(0.2, 1.1);
          // the notches hold a log chalet together (they resist real earthquakes!):
          // a few logs jump out of their notches at each jolt, so the walls fall apart
          if (Math.random() < 0.22) {
            sway = rand(1.3, 2.6) * Math.sqrt(env);
            lift = rand(1.6, 2.6);
          }
          const th = Math.random() * Math.PI * 2;
          b.applyImpulse(
            {
              x: Math.cos(th) * sway * d.mass,
              y: lift * Math.max(sway, 1) * d.mass,
              z: Math.sin(th) * sway * d.mass
            },
            true
          );
        }
        emit({ kind: 'dust', p: [cx + rand(-2, 2), 0.05, cz + rand(-2, 2)], n: 3, spread: 0.6 });
      } else {
        for (const d of w.debris) if (!d.lost) d.body.wakeUp();
      }
      kick(0.012 * env);
      return true;
    }
  };
}
