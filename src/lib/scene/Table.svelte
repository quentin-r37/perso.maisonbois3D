<script lang="ts">
  import { T } from '@threlte/core';
  import {
    CircleGeometry,
    InstancedMesh,
    Matrix4,
    MeshStandardMaterial,
    PlaneGeometry
  } from 'three';
  import { playMatTexture, tableTexture } from '../pieces/materials';
  import { G } from '../build/grid';

  const SIZE = 200;
  const tex = tableTexture();
  tex.repeat.set(SIZE / 8, SIZE / 8);
  const tableMat = new MeshStandardMaterial({ map: tex, roughness: 0.85, color: '#ffffff' });
  const tableGeo = new PlaneGeometry(SIZE, SIZE);

  // Printed play mat under the build area
  const MAT_W = 13;
  const MAT_D = 11;
  const matMat = new MeshStandardMaterial({ map: playMatTexture(MAT_W, MAT_D), roughness: 0.9 });
  const matGeo = new PlaneGeometry(MAT_W, MAT_D);
  const matEdge = new MeshStandardMaterial({ color: '#8fb84a', roughness: 0.9 });
  const matEdgeGeo = new PlaneGeometry(MAT_W + 0.08, MAT_D + 0.08);

  // Dots at the grid points (where the notches go)
  const R = 9;
  const dots = (() => {
    const g = new CircleGeometry(0.03, 10);
    g.rotateX(-Math.PI / 2);
    const m = new MeshStandardMaterial({
      color: '#2f5a1c',
      transparent: true,
      opacity: 0.32,
      depthWrite: false
    });
    const count = (2 * R + 1) ** 2;
    const mesh = new InstancedMesh(g, m, count);
    const mat = new Matrix4();
    let i = 0;
    for (let x = -R; x <= R; x++)
      for (let z = -R; z <= R; z++) {
        mat.makeTranslation((x + 3) * G, 0.01, (z + 3) * G);
        mesh.setMatrixAt(i++, mat);
      }
    mesh.renderOrder = 1;
    return mesh;
  })();
</script>

<T.Mesh
  geometry={tableGeo}
  material={tableMat}
  rotation.x={-Math.PI / 2}
  position={[1.5, 0, 1.5]}
  receiveShadow
  userData={{ pick: 'ground' }}
/>
<T.Mesh geometry={matEdgeGeo} material={matEdge} rotation.x={-Math.PI / 2} position={[1.5, 0.003, 1.2]} receiveShadow userData={{ pick: 'ground' }} />
<T.Mesh geometry={matGeo} material={matMat} rotation={[-Math.PI / 2, 0, Math.PI]} position={[1.5, 0.006, 1.2]} receiveShadow userData={{ pick: 'ground' }} />
<T is={dots} />
