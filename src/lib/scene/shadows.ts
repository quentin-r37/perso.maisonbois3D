import type { WebGLRenderer } from 'three';

/**
 * The shadow map is only redrawn when something that casts a shadow changed (a piece
 * placed, falling, a door swinging, a demolition…), not on every frame: turning the
 * camera or the pulse of the blue outlines leaves the shadows as they are, and the
 * shadow pass is half the cost of a frame.
 */
let renderer: WebGLRenderer | null = null;

export function manualShadows(r: WebGLRenderer) {
  renderer = r;
  r.shadowMap.autoUpdate = false;
  r.shadowMap.needsUpdate = true;
}

/** Something that casts a shadow changed: the shadows are redrawn with the next frame. */
export function refreshShadows() {
  if (renderer) renderer.shadowMap.needsUpdate = true;
}
