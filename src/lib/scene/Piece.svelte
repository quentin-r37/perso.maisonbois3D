<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { onMount, untrack } from 'svelte';
  import { LessEqualDepth, MeshBasicMaterial } from 'three';
  import type { PlacedPiece } from '../build/grid';
  import { transformOf } from '../build/transform';
  import { getOpenableGeometry, getGeometry } from '../pieces/geometry';
  import { materialsFor } from '../pieces/materials';
  import { clack } from '../audio/sfx';

  interface Props {
    piece: PlacedPiece;
    /** Door / shutters: open (true), closed (false), as modeled (undefined). */
    doorOpen?: boolean;
    animate?: boolean;
    highlight?: boolean;
    /** Hidden (during a demolition: debris stand in for the pieces, which stay mounted). */
    hidden?: boolean;
  }

  let { piece, doorOpen, animate = false, highlight = false, hidden = false }: Props = $props();

  const geo = $derived(getGeometry(piece));
  const mats = $derived(materialsFor(geo.paints, piece.uid % 3));
  const t = $derived(transformOf(piece));

  // Doors and shuttered windows: fixed frame + leaves turning on their hinges.
  const door = $derived(getOpenableGeometry(piece.type));
  const frameMats = $derived(door ? materialsFor(door.frame.paints, piece.uid % 3) : []);
  const leafMats = $derived(door ? door.leaves.map((l) => materialsFor(l.geometry.paints, piece.uid % 3)) : []);
  const leafTargets = $derived(door ? door.leaves.map((l) => (doorOpen === undefined ? l.ajar : doorOpen ? l.open : 0)) : []);
  // svelte-ignore state_referenced_locally
  let leafAngles = $state(leafTargets.slice());

  const swing = useTask(
    (delta) => {
      const k = 1 - Math.exp(-Math.min(delta, 1 / 20) * 9);
      let moving = false;
      leafAngles = leafAngles.map((a, i) => {
        const target = leafTargets[i] ?? a;
        const d = target - a;
        if (Math.abs(d) < 0.002) return target;
        moving = true;
        return a + d * k;
      });
      if (!moving) swing.stop();
    },
    { autoStart: false }
  );

  $effect(() => {
    const targets = leafTargets;
    untrack(() => {
      if (targets.some((a, i) => a !== leafAngles[i])) swing.start();
    });
  });

  // Drop animation: fall + small bounce, "clack" on impact.
  const START = 1.1;
  // read only once: the piece animates only when it appears
  // svelte-ignore state_referenced_locally
  const shouldAnimate = animate;
  let offset = $state(shouldAnimate ? START : 0);
  let vel = 0;
  let bounces = 0;

  const { start, stop } = useTask(
    (delta) => {
      const dt = Math.min(delta, 1 / 30);
      vel -= 28 * dt;
      offset += vel * dt;
      if (offset <= 0) {
        offset = 0;
        if (bounces === 0) {
          clack(1);
          vel = -vel * 0.18;
          bounces = 1;
        } else {
          vel = 0;
          stop();
        }
      }
    },
    { autoStart: false }
  );

  onMount(() => {
    if (shouldAnimate) {
      vel = -2;
      start();
    }
    return () => {
      stop();
      swing.stop();
    };
  });
</script>

<script lang="ts" module>
  const highlightMat = new MeshBasicMaterial({
    color: '#ff3b30',
    transparent: true,
    opacity: 0.45,
    depthFunc: LessEqualDepth,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
</script>

<T.Group position={[t.position[0], t.position[1] + offset, t.position[2]]} rotation.y={t.rotationY} visible={!hidden}>
  {#if door}
    <T.Mesh geometry={door.frame.geometry} material={frameMats} castShadow receiveShadow userData={{ pick: 'piece', uid: piece.uid }} />
    {#if highlight}
      <T.Mesh geometry={door.frame.geometry} material={highlightMat} renderOrder={2} />
    {/if}
    {#each door.leaves as leaf, i (i)}
      <T.Group position={leaf.hinge} rotation.y={-(leafAngles[i] ?? leaf.ajar) * leaf.dir}>
        <T.Mesh
          geometry={leaf.geometry.geometry}
          material={leafMats[i]}
          castShadow
          receiveShadow
          userData={{ pick: 'piece', uid: piece.uid }}
        />
        {#if highlight}
          <T.Mesh geometry={leaf.geometry.geometry} material={highlightMat} renderOrder={2} />
        {/if}
      </T.Group>
    {/each}
  {:else}
    <T.Mesh
      geometry={geo.geometry}
      material={mats}
      castShadow
      receiveShadow
      userData={{ pick: 'piece', uid: piece.uid }}
    />
    {#if highlight}
      <T.Mesh geometry={geo.geometry} material={highlightMat} renderOrder={2} />
    {/if}
  {/if}
</T.Group>
