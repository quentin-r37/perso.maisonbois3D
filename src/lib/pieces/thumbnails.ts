import {
  ACESFilmicToneMapping,
  AmbientLight,
  Box3,
  DirectionalLight,
  Group,
  Mesh,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer
} from 'three';
import { CATALOG } from './catalog';
import { transformOf } from '../build/transform';
import type { PieceSpec } from '../build/grid';
import { getGeometry } from './geometry';
import { materialsFor } from './materials';

function makeRenderer(width: number, height: number): WebGLRenderer | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return null;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(width, height, false);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);
  return renderer;
}

function makeScene(): Scene {
  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 1.4));
  const sun = new DirectionalLight(0xfff2dd, 2.6);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  return scene;
}

/** Frames the object in the camera, seen from `dir` (slightly above). */
function frame(camera: PerspectiveCamera, obj: Mesh | Group, dir: Vector3, fill: number) {
  const box = new Box3().setFromObject(obj);
  const center = box.getCenter(new Vector3());
  const radius = box.getSize(new Vector3()).length() / 2;
  const dist = (radius / Math.sin((camera.fov * Math.PI) / 360)) * fill;
  camera.position.copy(center).addScaledVector(dir, dist);
  camera.lookAt(center);
  camera.near = dist / 20;
  camera.far = dist * 4;
  camera.updateProjectionMatrix();
}

/**
 * Renders a picture of each finished model (the booklet cover), seen from the
 * front (the doors face -z).
 */
export function renderModelThumbnails(models: { id: string; pieces: PieceSpec[] }[], width = 240, height = 170): Record<string, string> {
  const out: Record<string, string> = {};
  const renderer = makeRenderer(width, height);
  if (!renderer) return out;
  const scene = makeScene();
  const camera = new PerspectiveCamera(30, width / height, 0.01, 100);
  for (const m of models) {
    const group = new Group();
    for (const p of m.pieces) {
      const g = getGeometry(p);
      const mesh = new Mesh(g.geometry, materialsFor(g.paints));
      const t = transformOf(p);
      mesh.position.set(...t.position);
      mesh.rotation.y = t.rotationY;
      group.add(mesh);
    }
    scene.add(group);
    frame(camera, group, new Vector3(0.9, 0.75, -1.15).normalize(), 0.8);
    renderer.render(scene, camera);
    out[m.id] = renderer.domElement.toDataURL('image/png');
    scene.remove(group);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}

/** Renders a thumbnail per piece type (offscreen renderer, then released). */
export function renderThumbnails(size = 112): Record<string, string> {
  const out: Record<string, string> = {};
  const renderer = makeRenderer(size, size);
  if (!renderer) return out;

  const scene = makeScene();
  const camera = new PerspectiveCamera(30, 1, 0.01, 100);
  const dir = new Vector3(0.9, 0.75, 1.15).normalize();

  for (const def of CATALOG) {
    // logs right way up (a crenel log facing -1 is upside down); roof pieces on one slope
    const g = getGeometry({ type: def.id, param: 5, param2: 5, side: def.kind === 'log' ? 1 : -1, slot: 1 });
    const mesh = new Mesh(g.geometry, materialsFor(g.paints));
    if (def.kind === 'roof' || def.kind === 'ridge') mesh.position.y = 0;
    scene.add(mesh);
    frame(camera, mesh, dir, 0.92);
    renderer.render(scene, camera);
    out[def.id] = renderer.domElement.toDataURL('image/png');
    scene.remove(mesh);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
