<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { onMount } from 'svelte';
  import { LessEqualDepth, MeshBasicMaterial } from 'three';
  import type { PlacedPiece } from '../build/grid';
  import { transformOf } from '../build/transform';
  import { getGeometry } from '../pieces/geometry';
  import { materialsFor } from '../pieces/materials';
  import { clack } from '../audio/sfx';

  interface Props {
    piece: PlacedPiece;
    animate?: boolean;
    highlight?: boolean;
    /** Hidden (during a demolition: debris stand in for the pieces, which stay mounted). */
    hidden?: boolean;
  }

  let { piece, animate = false, highlight = false, hidden = false }: Props = $props();

  const geo = $derived(getGeometry(piece));
  const mats = $derived(materialsFor(geo.paints, piece.uid % 3));
  const t = $derived(transformOf(piece));

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
    return () => stop();
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
</T.Group>
