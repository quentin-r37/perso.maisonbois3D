import { Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Vector3, type Material } from 'three';
import type { PieceSpec } from '../build/grid';
import { transformOf } from '../build/transform';
import type { Step } from '../guide/models/helpers';
import { getGeometry } from '../pieces/geometry';
import { materialsFor } from '../pieces/materials';
import { makeRenderer, makeScene } from '../pieces/thumbnails';

/** Pixel sizes of the pictures; the page layout uses the same proportions. */
export const COVER_SIZE = { w: 1500, h: 1100 };
export const STEP_SIZE = { w: 1360, h: 800 };

export interface NoticeImages {
  cover: string;
  steps: string[];
}

interface Built {
  mesh: Mesh;
  colors: Material[];
}

const nextFrame = () => new Promise<void>((r) => setTimeout(r));

/** View direction (from the build to the camera): the front, from above. */
const VIEW = new Vector3(0.9, 0.85, -1.15).normalize();

/**
 * Places the camera so the pieces fill the picture, whatever the proportions of the
 * build: it is fitted on the corners of each piece's own box, much tighter than the
 * bounding sphere of the thumbnails or one big box around everything.
 */
function fit(camera: PerspectiveCamera, meshes: Mesh[], margin = 1.08) {
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), VIEW).normalize();
  const up = new Vector3().crossVectors(VIEW, right);
  const corners: Vector3[] = [];
  for (const mesh of meshes) {
    mesh.updateMatrixWorld();
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) corners.push(new Vector3(x, y, z).applyMatrix4(mesh.matrixWorld));
  }
  const coords = corners.map((c) => [c.dot(right), c.dot(up), c.dot(VIEW)]);
  const mid = (k: number) => (Math.min(...coords.map((c) => c[k])) + Math.max(...coords.map((c) => c[k]))) / 2;
  // aim at the middle of what is seen, not of the box: the picture is centered
  const cx = mid(0);
  const cy = mid(1);
  const cz = mid(2);
  const tanV = Math.tan((camera.fov * Math.PI) / 360);
  const tanH = tanV * camera.aspect;
  let dist = 0;
  for (const [x, y, z] of coords) dist = Math.max(dist, z - cz + (Math.abs(x - cx) / tanH) * margin, z - cz + (Math.abs(y - cy) / tanV) * margin);
  const target = new Vector3().addScaledVector(right, cx).addScaledVector(up, cy).addScaledVector(VIEW, cz);
  camera.position.copy(target).addScaledVector(VIEW, dist);
  camera.lookAt(target);
  camera.near = dist / 50;
  camera.far = dist * 4;
  camera.updateProjectionMatrix();
}

/**
 * Draws the cover (the finished build) and one picture per step: the pieces of the
 * step in full color, everything placed before washed out. The point of view never
 * moves, so each picture reads as the previous one plus a few pieces.
 */
export async function renderNotice(
  steps: Step[],
  onProgress?: (done: number, total: number) => void
): Promise<NoticeImages | null> {
  const renderer = makeRenderer(COVER_SIZE.w, COVER_SIZE.h);
  if (!renderer) return null;
  renderer.setClearColor(0xffffff, 1);
  // pieces already in place: pale, unpainted (still readable on a black and white print)
  const pale = new MeshStandardMaterial({ color: 0xe6dfd3, roughness: 0.95 });
  try {
    const scene = makeScene();
    const camera = new PerspectiveCamera(30, COVER_SIZE.w / COVER_SIZE.h, 0.01, 100);
    const group = new Group();
    scene.add(group);

    const build = (p: PieceSpec): Built => {
      const g = getGeometry(p);
      const colors = materialsFor(g.paints);
      const mesh = new Mesh(g.geometry, colors);
      const t = transformOf(p);
      mesh.position.set(...t.position);
      mesh.rotation.y = t.rotationY;
      return { mesh, colors };
    };
    const built = steps.map((s) => s.pieces.map(build));

    for (const b of built.flat()) group.add(b.mesh);
    const meshes = built.flat().map((b) => b.mesh);
    fit(camera, meshes);
    renderer.render(scene, camera);
    const cover = renderer.domElement.toDataURL('image/jpeg', 0.9);

    // the steps: a wider picture, framed once on the finished build
    renderer.setSize(STEP_SIZE.w, STEP_SIZE.h, false);
    camera.aspect = STEP_SIZE.w / STEP_SIZE.h;
    fit(camera, meshes);
    group.clear();

    const images: string[] = [];
    for (let i = 0; i < built.length; i++) {
      if (i > 0) for (const b of built[i - 1]) b.mesh.material = pale;
      for (const b of built[i]) group.add(b.mesh);
      renderer.render(scene, camera);
      images.push(renderer.domElement.toDataURL('image/jpeg', 0.85));
      onProgress?.(i + 1, built.length);
      // lets the page show the progress
      await nextFrame();
    }
    return { cover, steps: images };
  } finally {
    pale.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
