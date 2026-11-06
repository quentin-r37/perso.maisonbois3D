<script lang="ts">
  import { T, useTask, useThrelte } from '@threlte/core';
  import { onDestroy, untrack } from 'svelte';
  import { Group, Quaternion, Vector3 } from 'three';
  import type { PlacedPiece } from '../build/grid';
  import { centerOf, transformOf } from '../build/transform';
  import { getGeometry } from '../pieces/geometry';
  import { materialsFor } from '../pieces/materials';
  import { app, type DemoShot } from '../app.svelte';
  import { loadRapier } from '../destroy/rapier';
  import { DemoWorld, type Debris, type Quat, type Vec3 } from '../destroy/world';
  import { explode, quake, tornado } from '../destroy/effects';
  import { emit, kick, resetFx, slowmo, timeScale } from '../destroy/fx';
  import { chime } from '../audio/sfx';
  import * as sfx from '../audio/demolition';

  /**
   * Stand-ins for the pieces during a demolition: same meshes, driven by the physics
   * engine, then flown back home on "rebuild".
   */
  let { pieces }: { pieces: PlacedPiece[] } = $props();

  // read once: the snapshot doesn't change during a demolition
  // svelte-ignore state_referenced_locally
  const items = pieces.map((piece) => {
    const geo = getGeometry(piece);
    const t = transformOf(piece);
    const half = t.rotationY / 2;
    return {
      piece,
      geo,
      mats: materialsFor(geo.paints, piece.uid % 3),
      p: t.position as Vec3,
      q: [0, Math.sin(half), 0, Math.cos(half)] as Quat,
      homeY: centerOf(piece)[1]
    };
  });
  const groups: Group[] = $state([]);

  let world: DemoWorld | null = null;
  let pending: DemoShot | null = null;
  let dead = false;
  let dustBudget = 0;
  resetFx();

  // ---------------------------------------------------------------------------
  // Sound: placed in stereo and faded with distance, from the camera's point of view

  const { camera } = useThrelte();
  const tmp = new Vector3();
  let stops: sfx.Stop[] = [];

  function stopSounds() {
    for (const s of stops) s();
    stops = [];
  }

  /** Stereo position (-1..1) and distance to the camera of a world point. */
  function where(x: number, y: number, z: number): { pan: number; dist: number } {
    const cam = camera.current;
    const dist = cam.position.distanceTo(tmp.set(x, y, z));
    tmp.project(cam);
    return { pan: Math.max(-1, Math.min(1, tmp.x)), dist };
  }

  function onImpact(d: Debris, i: number, surface: 'wood' | 'table') {
    const c = d.body.worldCom();
    sfx.woodHit({ intensity: i, size: d.mass, surface, ...where(c.x, c.y, c.z) });
    if (i > 0.4 && dustBudget > 0) {
      dustBudget--;
      const c = d.body.worldCom();
      emit({ kind: 'dust', p: [c.x, Math.max(0.05, c.y - 0.15), c.z], n: 2, spread: 0.25 });
    }
  }

  // svelte-ignore state_referenced_locally
  loadRapier()
    .then((R) => {
      if (dead) return;
      world = new DemoWorld(R, pieces, { onImpact });
      if (pending) fire(pending);
      pending = null;
    })
    .catch(() => {
      app.notify('The physics engine could not be loaded', 'warn');
      app.rebuild();
    });

  onDestroy(() => {
    dead = true;
    stopSounds();
    world?.dispose();
    world = null;
    resetFx();
  });

  function fire(shot: DemoShot) {
    if (!world) {
      pending = shot;
      return;
    }
    switch (shot.effect) {
      case 'explosion': {
        const c = world.center;
        explode(world, c, 16);
        emit({ kind: 'blast', p: c, power: 1 });
        sfx.explosion(1, where(...c).pan);
        sfx.muffle(0.3, 1);
        kick(1);
        slowmo(0.15, 0.3, 1);
        break;
      }
      case 'bomb': {
        const [x, y, z] = shot.point ?? world.center;
        const p: Vec3 = [x, Math.max(y, 0.15), z];
        explode(world, p, 15, 3.2);
        emit({ kind: 'blast', p, power: 0.6 });
        sfx.explosion(0.55, where(...p).pan);
        sfx.muffle(0.08, 0.4, 1400);
        kick(0.55);
        slowmo(0.35, 0.1, 0.45);
        break;
      }
      case 'tornado':
        world.addField(tornado(world, 5));
        stops.push(sfx.wind(5.3));
        kick(0.15);
        break;
      case 'quake':
        world.addField(quake(world, 4));
        stops.push(sfx.quake(4.2));
        kick(0.4);
        break;
    }
  }

  $effect(() => {
    const shot = app.demo.shot;
    if (shot) untrack(() => fire(shot));
  });

  // ---------------------------------------------------------------------------
  // Rebuild: every piece flies back home, the bottom of the chalet first

  const DUR = 0.55;
  interface Rewind {
    t: number;
    from: { p: Vector3; q: Quaternion; hop: number }[];
    delay: number[];
    landed: boolean[];
    /** Pieces that have to come back, and how many already did (the notes go up). */
    moving: number;
    back: number;
  }
  let rewind: Rewind | null = null;
  const homeP = new Vector3();
  const homeQ = new Quaternion();

  function startRewind() {
    stopSounds();
    const maxY = Math.max(0.1, ...items.map((it) => it.homeY));
    const r: Rewind = {
      t: 0,
      from: groups.map((g, i) => {
        const [x, y, z] = items[i].p;
        const dist = g.position.distanceTo(homeP.set(x, y, z));
        return { p: g.position.clone(), q: g.quaternion.clone(), hop: Math.min(2.5, 0.3 + dist * 0.25) };
      }),
      delay: items.map((it) => 0.05 + (it.homeY / maxY) * 0.9 + Math.random() * 0.08),
      landed: items.map((_, i) => {
        const g = groups[i];
        const [x, y, z] = items[i].p;
        // pieces that never moved don't need to come back
        return !g || g.position.distanceTo(homeP.set(x, y, z)) < 0.002;
      }),
      moving: 0,
      back: 0
    };
    r.moving = r.landed.filter((l) => !l).length;
    rewind = r;
    for (const g of groups) if (g) g.visible = true;
    if (r.moving) stops.push(sfx.rewind(Math.max(...r.delay.filter((_, i) => !r.landed[i])) + DUR));
  }

  const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

  function stepRewind(dt: number) {
    if (!rewind) startRewind();
    const r = rewind!;
    r.t += dt;
    let done = true;
    groups.forEach((g, i) => {
      if (!g || r.landed[i]) return;
      const it = items[i];
      const k = (r.t - r.delay[i]) / DUR;
      if (k < 0) {
        done = false;
        return;
      }
      homeP.set(...it.p);
      homeQ.set(...it.q);
      if (k >= 1) {
        g.position.copy(homeP);
        g.quaternion.copy(homeQ);
        r.landed[i] = true;
        r.back++;
        sfx.snap(r.back / Math.max(1, r.moving), where(...it.p).pan);
        return;
      }
      done = false;
      const e = easeInOut(k);
      const f = r.from[i];
      g.position.lerpVectors(f.p, homeP, e);
      g.position.y += Math.sin(Math.PI * k) * f.hop;
      g.quaternion.slerpQuaternions(f.q, homeQ, e);
    });
    if (done) {
      if (r.moving) chime();
      rewind = null;
      world?.dispose();
      world = null;
      app.endDemolition();
    }
  }

  useTask((delta) => {
    const dt = Math.min(delta, 1 / 20);
    if (app.demo.phase === 'rebuilding') {
      stepRewind(dt);
      return;
    }
    if (!world) return;
    dustBudget = Math.min(dustBudget + dt * 20, 4);
    world.step(dt * timeScale(dt));
    world.debris.forEach((d, i) => {
      const g = groups[i];
      if (!g || !d.active) return;
      if (d.lost) {
        g.visible = false;
        return;
      }
      const tr = d.body.translation();
      const rot = d.body.rotation();
      g.position.set(tr.x, tr.y, tr.z);
      g.quaternion.set(rot.x, rot.y, rot.z, rot.w);
    });
  });
</script>

{#each items as it, i (it.piece.uid)}
  <T.Group bind:ref={groups[i]} position={it.p} quaternion={it.q}>
    <T.Mesh geometry={it.geo.geometry} material={it.mats} castShadow receiveShadow userData={{ pick: 'debris' }} />
  </T.Group>
{/each}
