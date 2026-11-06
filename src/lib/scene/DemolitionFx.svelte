<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import {
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

  /** Particles of the demolition: wood splinters, dust, fireball, shock ring, flash. */

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
  }
  const blank = (): P => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, spin: 0, age: 1, life: 0, size: 0, grow: 0 });

  // wood splinters
  const NS = 260;
  const splinterMesh = new InstancedMesh(
    new BoxGeometry(0.16, 0.035, 0.04),
    new MeshStandardMaterial({ roughness: 0.8 }),
    NS
  );
  splinterMesh.castShadow = true;
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

  // fireball + shock ring + flash (one at a time: the last blast)
  const fireMat = new MeshBasicMaterial({ color: '#ffb547', transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
  const fireGeo = new SphereGeometry(1, 24, 16);
  const ringMat = new MeshBasicMaterial({ color: '#fff3d6', transparent: true, opacity: 0, depthWrite: false });
  const ringGeo = new RingGeometry(0.85, 1, 48);
  ringGeo.rotateX(-Math.PI / 2);
  let fire: Mesh | undefined = $state();
  let ring: Mesh | undefined = $state();
  let flashIntensity = $state(0);
  let flashPos = $state<[number, number, number]>([0, 1, 0]);
  const blast = { age: 99, power: 1 };

  function spawnSplinter(x: number, y: number, z: number, speed: number) {
    const p = splinters[si];
    si = (si + 1) % NS;
    const th = Math.random() * Math.PI * 2;
    const up = rand(0.25, 1);
    const h = Math.sqrt(1 - up * up);
    Object.assign(p, {
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
    Object.assign(p, { x, y, z, vx, vy, vz, age: 0, life, size, grow: rand(1.6, 2.6), rx: Math.random() * 6, ry: Math.random() * 6 });
  }

  function drain() {
    for (const e of fx.events) {
      if (e.kind === 'blast') {
        const [x, y, z] = e.p;
        const k = e.power;
        blast.age = 0;
        blast.power = k;
        fire?.position.set(x, y, z);
        ring?.position.set(x, 0.03, z);
        flashPos = [x, y + 0.5, z];
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

  useTask((delta) => {
    const dt = Math.min(delta, 1 / 20);
    drain();

    // splinters: ballistic, bounce on the table, shrink at the end of their life
    splinters.forEach((p, i) => {
      if (p.age >= p.life) {
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
    });
    splinterMesh.instanceMatrix.needsUpdate = true;

    // dust: slows down, rises a little, swells, then shrinks away
    dust.forEach((p, i) => {
      if (p.age >= p.life) {
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
    });
    dustMesh.instanceMatrix.needsUpdate = true;

    // fireball, ring and flash of the last blast
    blast.age += dt;
    const a = blast.age;
    const k = blast.power;
    if (fire) {
      const t = Math.min(1, a / 0.45);
      fire.scale.setScalar(0.2 + (1 - (1 - t) ** 3) * 2.1 * k);
      fireMat.opacity = a < 0.45 ? 0.95 * (1 - t) ** 1.5 : 0;
      fire.visible = fireMat.opacity > 0.01;
    }
    if (ring) {
      const t = Math.min(1, a / 0.7);
      ring.scale.setScalar(0.3 + (1 - (1 - t) ** 2) * 6 * k);
      ringMat.opacity = a < 0.7 ? 0.7 * (1 - t) : 0;
      ring.visible = ringMat.opacity > 0.01;
    }
    flashIntensity = a < 0.6 ? 90 * k * Math.exp(-a * 9) : 0;
  });
</script>

<T is={splinterMesh} />
<T is={dustMesh} />
<T.Mesh bind:ref={fire} geometry={fireGeo} material={fireMat} visible={false} renderOrder={3} />
<T.Mesh bind:ref={ring} geometry={ringGeo} material={ringMat} visible={false} renderOrder={3} />
<T.PointLight position={flashPos} intensity={flashIntensity} distance={14} decay={1.6} color="#ffcf8a" />
