<script lang="ts" module>
  import { MeshBasicMaterial } from 'three';
  const pickMat = new MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
</script>

<script lang="ts">
  import { T } from '@threlte/core';
  import type { Roof } from '../build/roof';
  import { G, Q } from '../build/grid';
  import { PLANK_W } from '../build/roof';
  import { roofPickGeometry } from '../pieces/geometry';

  let { roofs }: { roofs: Roof[] } = $props();
</script>

{#each roofs as roof (roof.key)}
  {@const perpC = roof.start + (roof.n * PLANK_W) / 2}
  {@const pos = (roof.axis === 'x' ? [roof.ix * G, roof.y * Q, perpC] : [perpC, roof.y * Q, roof.iz * G]) as [number, number, number]}
  {#each [-1, 1] as side (side)}
    <T.Mesh
      geometry={roofPickGeometry(roof.W, roof.n, side)}
      material={pickMat}
      position={pos}
      rotation.y={roof.axis === 'x' ? 0 : -Math.PI / 2}
      userData={{ pick: 'roof', roofKey: roof.key, side }}
    />
  {/each}
{/each}
