import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  DirectionalLight,
  Mesh,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer
} from 'three';
import { CATALOG } from './catalog';
import { getGeometry } from './geometry';
import { materialsFor } from './materials';

/** Renders a thumbnail per piece type (offscreen renderer, then released). */
export function renderThumbnails(size = 112): Record<string, string> {
  const out: Record<string, string> = {};
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return out;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 1.4));
  const sun = new DirectionalLight(0xfff2dd, 2.6);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  const camera = new PerspectiveCamera(30, 1, 0.01, 100);

  for (const def of CATALOG) {
    const g = getGeometry({ type: def.id, param: 5, param2: 5, side: -1, slot: 1 });
    const mesh = new Mesh(g.geometry, materialsFor(g.paints));
    if (def.kind === 'roof' || def.kind === 'ridge') mesh.position.y = 0;
    scene.add(mesh);
    const box = new Box3().setFromObject(mesh);
    const center = box.getCenter(new Vector3());
    const radius = box.getSize(new Vector3()).length() / 2;
    const dir = new Vector3(0.9, 0.75, 1.15).normalize();
    const dist = radius / Math.sin((camera.fov * Math.PI) / 360) * 0.92;
    camera.position.copy(center).addScaledVector(dir, dist);
    camera.lookAt(center);
    camera.near = dist / 20;
    camera.far = dist * 4;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    out[def.id] = renderer.domElement.toDataURL('image/png');
    scene.remove(mesh);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
