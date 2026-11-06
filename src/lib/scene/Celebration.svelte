<script lang="ts">
  import { T, useTask } from '@threlte/core';
  import { BoxGeometry, Color, InstancedMesh, MeshStandardMaterial, Object3D } from 'three';

  let { center }: { center: [number, number, number] } = $props();

  const N = 260;
  const COLORS = ['#6fbf3b', '#d42a25', '#f3d23a', '#dca46a', '#ffffff'];
  const mesh = new InstancedMesh(
    new BoxGeometry(0.09, 0.02, 0.06),
    new MeshStandardMaterial({ roughness: 0.6 }),
    N
  );
  mesh.castShadow = false;
  const dummy = new Object3D();
  const parts = Array.from({ length: N }, (_, i) => {
    mesh.setColorAt(i, new Color(COLORS[i % COLORS.length]));
    return {
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      rx: Math.random() * 6,
      ry: Math.random() * 6,
      spin: (Math.random() - 0.5) * 10,
      delay: Math.random() * 0.8
    };
  });

  function reset() {
    // svelte-ignore state_referenced_locally
    const [cx, cy, cz] = center;
    for (const p of parts) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.2;
      p.x = cx + Math.cos(a) * r;
      p.z = cz + Math.sin(a) * r;
      p.y = cy + 4.5;
      p.vx = Math.cos(a) * (2 + Math.random() * 3);
      p.vz = Math.sin(a) * (2 + Math.random() * 3);
      p.vy = 3 + Math.random() * 4;
    }
  }
  reset();

  let time = 0;
  useTask((delta) => {
    const dt = Math.min(delta, 1 / 30);
    time += dt;
    parts.forEach((p, i) => {
      if (time > p.delay) {
        p.vy -= 6 * dt;
        p.vx *= 0.985;
        p.vz *= 0.985;
        if (p.vy < -1.6) p.vy = -1.6; // falls like a leaf
        p.x += p.vx * dt;
        p.y = Math.max(0.01, p.y + p.vy * dt);
        p.z += p.vz * dt;
        if (p.y > 0.02) {
          p.rx += p.spin * dt;
          p.ry += p.spin * 0.7 * dt;
        }
      }
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rx, p.ry, 0);
      dummy.scale.setScalar(time > p.delay ? 1 : 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
</script>

<T is={mesh} />
