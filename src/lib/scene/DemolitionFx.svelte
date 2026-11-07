<script lang="ts">
  import { T, useTask, useThrelte } from '@threlte/core';
  import {
    Group,
    BoxGeometry,
    Color,
    IcosahedronGeometry,
    InstancedMesh,
    Mesh,
    MeshBasicMaterial,
    MeshStandardMaterial,
    Object3D,
    RingGeometry,
    SphereGeometry
  } from 'three';
  import { fx } from '../destroy/fx';
  import { GRAVITY } from '../destroy/world';

  /**
   * Particles of the demolition: wood splinters, dust, fireball, shock ring, flash.
   * Always mounted (hidden and idle outside a demolition) so that its shaders are compiled
   * at startup instead of freezing the first explosion.
   */
  let { active }: { active: boolean } = $props();
  const { invalidate, renderer } = useThrelte();

  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  const dummy = new Object3D();

  interface P {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    rx: number;
    ry: number;
    spin: number;
    age: number;
    life: number;
    size: number;
    grow: number;
    /** Dead and already hidden: nothing to do any more. */
    hidden: boolean;
  }
  const blank = (): P => ({
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    rx: 0,
    ry: 0,
    spin: 0,
    age: 1,
    life: 0,
    size: 0,
    grow: 0,
    hidden: true
  });
  /** All instances start collapsed (scale 0): nothing shows before the first blast. */
  function collapse(mesh: InstancedMesh) {
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, dummy.matrix);
    mesh.instanceMatrix.needsUpdate = true;
  }

  // wood splinters
  const NS = 260;
  const splinterMesh = new InstancedMesh(
    new BoxGeometry(0.16, 0.035, 0.04),
    new MeshStandardMaterial({ roughness: 0.8 }),
    NS
  );
  splinterMesh.frustumCulled = false;
  const WOOD = ['#c99a5e', '#b07d45', '#ddb27a', '#9a6a3a'];
  for (let i = 0; i < NS; i++) splinterMesh.setColorAt(i, new Color(WOOD[i % WOOD.length]));
  const splinters = Array.from({ length: NS }, blank);
  let si = 0;

  // dust puffs
  const ND = 200;
  const dustMesh = new InstancedMesh(
    new IcosahedronGeometry(0.5, 1),
    new MeshStandardMaterial({ color: '#e6d6bb', roughness: 1, transparent: true, opacity: 0.5, depthWrite: false }),
    ND
  );
  dustMesh.frustumCulled = false;
  const dust = Array.from({ length: ND }, blank);
  let di = 0;

  // fireball + shock ring (one at a time: the last blast); the flash lights up the ambient light
  const fireMat = new MeshBasicMaterial({ color: '#ffb547', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const fireGeo = new SphereGeometry(1, 24, 16);
  const ringMat = new MeshBasicMaterial({ color: '#fff3d6', transparent: true, opacity: 0, depthWrite: false });
  const ringGeo = new RingGeometry(0.85, 1, 48);
  ringGeo.rotateX(-Math.PI / 2);
  const fire = new Mesh(fireGeo, fireMat);
  fire.renderOrder = 3;
  const ring = new Mesh(ringGeo, ringMat);
  ring.renderOrder = 3;
  const blast = { age: 99, power: 1 };

  collapse(splinterMesh);
  collapse(dustMesh);
  const root = new Group();
  root.add(splinterMesh, dustMesh, fire, ring);

  // Render it a couple of times at startup, invisibly (collapsed instances, transparent
  // fireball and ring), so that its shaders get compiled now — exactly as they will be
  // used — and not at the first blast. (Counted in frames actually rendered: the canvas
  // may have no size yet at mount, in which case nothing is drawn.)
  root.visible = true;
  fire.visible = true;
  ring.visible = true;
  let warmFrom = -1;
  let warming = true;
  const warm = useTask(() => {
    const frame = renderer.info.render.frame;
    if (warmFrom < 0) warmFrom = frame;
    if (frame - warmFrom < 2) return;
    fire.visible = false;
    ring.visible = false;
    root.visible = active;
    warming = false;
    warm.stop();
  });

  function reset() {
    for (const p of [...splinters, ...dust]) {
      p.age = p.life;
      p.hidden = true;
    }
    collapse(splinterMesh);
    collapse(dustMesh);
    blast.age = 99;
    fx.flash = 0;
  }

  function spawnSplinter(x: number, y: number, z: number, speed: number) {
    const p = splinters[si];
    si = (si + 1) % NS;
    const th = Math.random() * Math.PI * 2;
    const up = rand(0.25, 1);
    const h = Math.sqrt(1 - up * up);
    Object.assign(p, {
      hidden: false,
      x,
      y,
      z,
      vx: Math.cos(th) * h * speed,
      vy: up * speed,
      vz: Math.sin(th) * h * speed,
      rx: Math.random() * 6,
      ry: Math.random() * 6,
      spin: rand(-14, 14),
      age: 0,
      life: rand(2.5, 4),
      size: rand(0.6, 1.4)
    });
  }

  function spawnDust(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number) {
    const p = dust[di];
    di = (di + 1) % ND;
    Object.assign(p, {
      hidden: false,
      x,
      y,
      z,
      vx,
      vy,
      vz,
      age: 0,
      life,
      size,
      grow: rand(1.6, 2.6),
      rx: Math.random() * 6,
      ry: Math.random() * 6
    });
  }

  function drain() {
    for (const e of fx.events) {
      if (e.kind === 'blast') {
        const [x, y, z] = e.p;
        const k = e.power;
        blast.age = 0;
        blast.power = k;
        fire.position.set(x, y, z);
        ring.position.set(x, 0.03, z);
        fx.flash = k;
        for (let i = 0; i < 110 * k; i++) spawnSplinter(x + rand(-0.4, 0.4), y + rand(-0.2, 0.4), z + rand(-0.4, 0.4), rand(3, 11) * (0.6 + k * 0.4));
        for (let i = 0; i < 34 * k; i++) {
          const th = Math.random() * Math.PI * 2;
          const sp = rand(1, 3.5) * k;
          spawnDust(x, Math.max(0.1, y * 0.5), z, Math.cos(th) * sp, rand(0.2, 1.2), Math.sin(th) * sp, rand(0.3, 0.6) * (0.5 + k * 0.5), rand(1.2, 2.2));
        }
      } else if (e.kind === 'dust') {
        const s = e.spread ?? 0.3;
        for (let i = 0; i < e.n; i++)
          spawnDust(
            e.p[0] + rand(-s, s),
            e.p[1],
            e.p[2] + rand(-s, s),
            rand(-0.6, 0.6),
            rand(0.1, 0.6),
            rand(-0.6, 0.6),
            rand(0.15, 0.3),
            rand(0.8, 1.4)
          );
      } else {
        spawnDust(...e.p, ...e.v, e.size, rand(0.6, 1));
      }
    }
    fx.events.length = 0;
  }

  const { start, stop } = useTask(
    (delta) => {
      const dt = Math.min(delta, 1 / 20);
      drain();
      let dirty = false;

      // splinters: ballistic, bounce on the table, shrink at the end of their life
      splinters.forEach((p, i) => {
        if (p.age >= p.life) {
          if (p.hidden) return;
          p.hidden = true;
          dummy.scale.setScalar(0);
        } else {
          p.age += dt;
          p.vy -= GRAVITY * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.z += p.vz * dt;
          if (p.y < 0.02) {
            p.y = 0.02;
            p.vy = Math.abs(p.vy) > 1 ? -p.vy * 0.3 : 0;
            p.vx *= 0.6;
            p.vz *= 0.6;
            p.spin *= 0.5;
          }
          p.rx += p.spin * dt;
          p.ry += p.spin * 0.6 * dt;
          const fade = Math.min(1, (p.life - p.age) / 0.5);
          dummy.scale.setScalar(p.size * fade);
        }
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(p.rx, p.ry, 0);
        dummy.updateMatrix();
        splinterMesh.setMatrixAt(i, dummy.matrix);
        dirty = true;
      });
      if (dirty) splinterMesh.instanceMatrix.needsUpdate = true;
      dirty = false;

      // dust: slows down, rises a little, swells, then shrinks away
      dust.forEach((p, i) => {
        if (p.age >= p.life) {
          if (p.hidden) return;
          p.hidden = true;
          dummy.scale.setScalar(0);
        } else {
          p.age += dt;
          const drag = Math.exp(-2.2 * dt);
          p.vx *= drag;
          p.vz *= drag;
          p.vy = p.vy * drag + 0.25 * dt;
          p.x += p.vx * dt;
          p.y = Math.max(0.05, p.y + p.vy * dt);
          p.z += p.vz * dt;
          const k = p.age / p.life;
          const s = p.size * (1 + (p.grow - 1) * Math.sqrt(k)) * (k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1);
          dummy.scale.setScalar(Math.max(0, s));
        }
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(p.rx, p.ry, 0);
        dummy.updateMatrix();
        dustMesh.setMatrixAt(i, dummy.matrix);
        dirty = true;
      });
      if (dirty) dustMesh.instanceMatrix.needsUpdate = true;

      // fireball, ring and flash of the last blast
      blast.age += dt;
      const a = blast.age;
      const k = blast.power;
      {
        const t = Math.min(1, a / 0.45);
        fire.scale.setScalar(0.2 + (1 - (1 - t) ** 3) * 2.1 * k);
        fireMat.opacity = a < 0.45 ? 0.95 * (1 - t) ** 1.5 : 0;
        fire.visible = fireMat.opacity > 0.01;
      }
      {
        const t = Math.min(1, a / 0.7);
        ring.scale.setScalar(0.3 + (1 - (1 - t) ** 2) * 6 * k);
        ringMat.opacity = a < 0.7 ? 0.7 * (1 - t) : 0;
        ring.visible = ringMat.opacity > 0.01;
      }
      fx.flash = a < 0.6 ? k * Math.exp(-a * 9) : 0;
    },
    { autoStart: false }
  );

  $effect(() => {
    if (active) {
      root.visible = true;
      start();
    } else {
      stop();
      reset();
      if (!warming) root.visible = false;
      invalidate();
    }
  });
</script>

<T is={root} />
