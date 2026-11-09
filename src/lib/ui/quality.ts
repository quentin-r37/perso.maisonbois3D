import { PCFShadowMap, PCFSoftShadowMap, type ShadowMapType } from 'three';

/** Rendering quality, from cheapest to finest. The last one is the original look. */
export const QUALITY: readonly {
  label: string;
  /** Multiplies the screen's pixel ratio (capped at 2): 0.5 = a quarter of the pixels. */
  scale: number;
  shadows: false | ShadowMapType;
  shadowSize: number;
}[] = [
  { label: 'Minimal', scale: 0.5, shadows: false, shadowSize: 512 },
  { label: 'Low', scale: 0.75, shadows: false, shadowSize: 512 },
  { label: 'Medium', scale: 1, shadows: PCFShadowMap, shadowSize: 1024 },
  { label: 'High', scale: 1, shadows: PCFSoftShadowMap, shadowSize: 2048 }
];

export const MAX_QUALITY = QUALITY.length - 1;

/**
 * True when WebGL is drawn by the CPU (SwiftShader, Microsoft Basic Render, llvmpipe…):
 * there the full quality crawls at a few frames per second.
 */
export function isSoftwareRenderer(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /swiftshader|basic render|llvmpipe|softpipe|software/i.test(name);
  } catch {
    return false;
  }
}
