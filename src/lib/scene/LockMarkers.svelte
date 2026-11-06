<script lang="ts" module>
  import { MeshBasicMaterial, RingGeometry, SphereGeometry } from 'three';

  const ring = new RingGeometry(0.13, 0.19, 28);
  ring.rotateX(-Math.PI / 2);
  const dot = new SphereGeometry(0.05, 12, 8);
  const ringMat = new MeshBasicMaterial({
    color: '#7dff8a',
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false
  });
  const dotMat = new MeshBasicMaterial({ color: '#ffffff', depthTest: false, depthWrite: false });
</script>

<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import type { Contact } from '../build/snap';

  /** Where the notches of the ghost lock into those of the pieces already in place. */
  let { locks }: { locks: Contact[] } = $props();

  let t = 0;
  let scale = $state(1);
  useTask((delta) => {
    t += delta;
    scale = 1 + 0.18 * Math.sin(t * 6);
    ringMat.opacity = 0.7 + 0.3 * Math.sin(t * 6);
  });
</script>

{#each locks as l, i (i)}
  <T.Group position={[l.x, l.y + 0.01, l.z]}>
    <T.Mesh geometry={ring} material={ringMat} scale={scale} renderOrder={10} />
    <T.Mesh geometry={dot} material={dotMat} renderOrder={11} />
  </T.Group>
{/each}
