import {
  CanvasTexture,
  Color,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Material,
  type Texture
} from 'three';
import type { Paint } from './catalog';

const isBrowser = typeof document !== 'undefined';

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/** Tileable wood grain (grayscale): fibers along U. */
function makeGrain(size = 256, rings = 9, seed = 1): HTMLCanvasElement {
  const c = canvas(size);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const TAU = Math.PI * 2;
  let s = seed * 9301 + 49297;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const p1 = rand() * TAU;
  const p2 = rand() * TAU;
  const p3 = rand() * TAU;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const u = i / size;
      const v = j / size;
      const warp =
        0.012 * Math.sin(TAU * (u * 1 + v * 2) + p1) +
        0.006 * Math.sin(TAU * (u * 3 - v * 5) + p2) +
        0.003 * Math.sin(TAU * (u * 7 + v * 11) + p3);
      const t = (v + warp) * rings;
      const ring = 0.5 + 0.5 * Math.sin(TAU * t);
      const line = Math.pow(ring, 10);
      const fine = 0.5 + 0.5 * Math.sin(TAU * (v + warp * 0.3) * rings * 5);
      const noise = rand();
      const val = 1 - 0.11 * line - 0.03 * ring - 0.035 * fine - 0.04 * noise;
      const g = Math.max(0, Math.min(255, Math.round(val * 255)));
      const o = (j * size + i) * 4;
      img.data[o] = g;
      img.data[o + 1] = g;
      img.data[o + 2] = g;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

let grain: Texture | null = null;
function grainTexture(): Texture {
  if (!grain) {
    grain = new CanvasTexture(makeGrain(256, 14, 3));
    grain.wrapS = grain.wrapT = RepeatWrapping;
    grain.colorSpace = SRGBColorSpace;
    grain.anisotropy = 8;
  }
  return grain;
}

const PAINT_COLORS: Record<Paint, string> = {
  wood: '#d9a066',
  light: '#f0d6a8',
  orange: '#e8862a',
  white: '#f6f3ec',
  green: '#6fbf3b',
  red: '#d42a25',
  yellow: '#f3d23a',
  dark: '#5a3a22',
  blue: '#3f8fd8',
  skin: '#f1c7a1',
  hair: '#c77b2c'
};

const WOOD_TINTS = ['#dca46a', '#d29a5f', '#e1ad76'];

const cache = new Map<string, Material>();

function make(paint: Paint, variant = 0): Material {
  const key = `${paint}:${variant}`;
  let m = cache.get(key);
  if (m) return m;
  const painted = paint !== 'wood' && paint !== 'dark' && paint !== 'light';
  const plastic = paint === 'white';
  const color = paint === 'wood' ? WOOD_TINTS[variant % WOOD_TINTS.length] : PAINT_COLORS[paint];
  const useGrain = paint !== 'skin' && paint !== 'blue' && paint !== 'hair' && !plastic;
  m = new MeshStandardMaterial({
    color: new Color(color),
    map: isBrowser && useGrain ? grainTexture() : null,
    bumpMap: isBrowser && useGrain ? grainTexture() : null,
    bumpScale: painted ? 0.4 : 1.2,
    roughness: plastic ? 0.35 : painted ? 0.5 : 0.72,
    metalness: 0
  });
  cache.set(key, m);
  return m;
}

export function material(paint: Paint, variant = 0): Material {
  return make(paint, paint === 'wood' ? variant : 0);
}

export function materialsFor(paints: Paint[], variant = 0): Material[] {
  return paints.map((p) => material(p, variant));
}

/** Printed play mat (the green board you build on): meadow, trees, path, pond. */
export function playMatTexture(widthU: number, depthU: number, pxPerU = 128): Texture {
  const W = Math.round(widthU * pxPerU);
  const H = Math.round(depthU * pxPerU);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const u = pxPerU;

  // meadow
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#b9dc6a');
  g.addColorStop(1, '#a6d05a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // grass tufts
  ctx.strokeStyle = 'rgba(80,140,40,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < (W * H) / 900; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    ctx.beginPath();
    ctx.moveTo(x - 3, y);
    ctx.lineTo(x, y - 6);
    ctx.lineTo(x + 3, y);
    ctx.stroke();
  }

  // dirt path crossing the mat
  ctx.strokeStyle = '#e6d3a3';
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.55 * u;
  ctx.beginPath();
  ctx.moveTo(W * 0.52, H);
  ctx.bezierCurveTo(W * 0.5, H * 0.75, W * 0.2, H * 0.7, -u, H * 0.55);
  ctx.stroke();

  // pond
  ctx.fillStyle = '#8fcbe8';
  ctx.beginPath();
  ctx.ellipse(W * 0.86, H * 0.82, 0.9 * u, 0.5 * u, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(W * 0.84, H * 0.79, 0.32 * u, 0.08 * u, -0.3, 0, Math.PI * 2);
  ctx.fill();

  const roundTree = (x: number, y: number, r: number) => {
    ctx.fillStyle = '#8a5a34';
    ctx.fillRect(x - r * 0.12, y, r * 0.24, r * 0.9);
    ctx.fillStyle = '#3f9a3c';
    ctx.beginPath();
    ctx.arc(x, y - r * 0.1, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(x - r * 0.35, y - r * 0.4, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  };
  const fir = (x: number, y: number, h: number) => {
    ctx.fillStyle = '#7a4e2c';
    ctx.fillRect(x - h * 0.05, y - h * 0.05, h * 0.1, h * 0.18);
    ctx.fillStyle = '#2f7f45';
    for (let k = 0; k < 3; k++) {
      const w = h * (0.42 - k * 0.1);
      const top = y - h * (0.45 + k * 0.28);
      ctx.beginPath();
      ctx.moveTo(x, top - h * 0.12);
      ctx.lineTo(x + w, y - h * (0.05 + k * 0.28));
      ctx.lineTo(x - w, y - h * (0.05 + k * 0.28));
      ctx.closePath();
      ctx.fill();
    }
  };
  const flower = (x: number, y: number) => {
    const colors = ['#ffffff', '#ffd94a', '#ff8fa8'];
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#f2a33a';
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  };

  // decorations along the edges, keeping the center free for building
  const border = (x: number, y: number) => {
    const cx = x / W;
    const cy = y / H;
    return cx < 0.16 || cx > 0.84 || cy < 0.16 || cy > 0.86;
  };
  for (let i = 0; i < 70; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    if (border(x, y)) flower(x, y);
  }
  let placed = 0;
  for (let i = 0; i < 600 && placed < 34; i++) {
    const x = u * 0.6 + rnd() * (W - 1.2 * u);
    const y = u * 0.9 + rnd() * (H - 1.4 * u);
    if (!border(x, y)) continue;
    if (rnd() < 0.5) roundTree(x, y, (0.17 + rnd() * 0.1) * u);
    else fir(x, y, (0.42 + rnd() * 0.22) * u);
    placed++;
  }
  // printed border
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 0.06 * u;
  ctx.strokeRect(0.15 * u, 0.15 * u, W - 0.3 * u, H - 0.3 * u);

  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Wooden table: wide planks. */
export function tableTexture(): Texture {
  const size = 1024;
  const c = canvas(size);
  const ctx = c.getContext('2d')!;
  const planks = 4;
  const ph = size / planks;
  const tones = ['#c99a68', '#c39261', '#cfa26f', '#c6965f'];
  for (let k = 0; k < planks; k++) {
    ctx.fillStyle = tones[k];
    ctx.fillRect(0, k * ph, size, ph);
    const g = makeGrain(256, 12, k + 7);
    ctx.globalAlpha = 0.45;
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < 4; i++) ctx.drawImage(g, i * 256, k * ph, 256, ph);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(70,40,20,0.35)';
    ctx.fillRect(0, k * ph, size, 3);
  }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
