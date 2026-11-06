<script lang="ts" module>
  import { MeshStandardMaterial } from 'three';

  const ghostMat = (color: string, opacity: number) =>
    new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.35,
      transparent: true,
      opacity,
      depthWrite: false,
      roughness: 0.6
    });

  export const GHOST_OK = ghostMat('#4cd964', 0.55);
  export const GHOST_BAD = ghostMat('#ff3b30', 0.45);
  export const BLUEPRINT = ghostMat('#3d9bff', 0.28);
</script>

<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import type { PieceSpec } from '../build/grid';
  import { transformOf } from '../build/transform';
  import { getGeometry } from '../pieces/geometry';

  interface Props {
    spec: PieceSpec;
    variant: 'ok' | 'bad' | 'blueprint';
    lift?: number;
  }

  let { spec, variant, lift = 0 }: Props = $props();

  const geo = $derived(getGeometry(spec));
  const t = $derived(transformOf(spec));
  const material = $derived(variant === 'ok' ? GHOST_OK : variant === 'bad' ? GHOST_BAD : BLUEPRINT);

  let time = 0;
  useTask((delta) => {
    time += delta;
    if (variant === 'blueprint') BLUEPRINT.opacity = 0.18 + 0.14 * (0.5 + 0.5 * Math.sin(time * 3.2));
  });
</script>

<T.Mesh
  geometry={geo.geometry}
  {material}
  position={[t.position[0], t.position[1] + lift + 0.004, t.position[2]]}
  rotation.y={t.rotationY}
  renderOrder={3}
/>
