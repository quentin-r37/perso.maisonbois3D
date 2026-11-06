/**
 * Sounds synthesized with Web Audio (no audio files).
 *
 * Every sound goes through a small mixing bus: master → "muffle" low-pass (slow motion)
 * → compressor (many sounds at once don't clip), plus a reverb send for the big ones.
 */
let ctx: AudioContext | null = null;
let muted = false;
let lastClack = 0;
/** Offline rendering (dev checks): sounds are scheduled on this context instead. */
let override: BaseAudioContext | null = null;

export function setMuted(m: boolean) {
  muted = m;
}

/** Context to schedule a new sound on, or null (muted, no Web Audio). */
export function ac(): BaseAudioContext | null {
  if (override) return override;
  if (muted || typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** To call on a user gesture (unlocks audio on iOS). */
export function unlockAudio() {
  ac();
}

/** Renders the sounds scheduled by `play` into a buffer (to check levels in dev). */
export async function renderOffline(seconds: number, play: () => void): Promise<AudioBuffer> {
  const off = new OfflineAudioContext(2, Math.ceil(44100 * seconds), 44100);
  override = off;
  try {
    play();
  } finally {
    override = null;
  }
  return off.startRendering();
}

// ---------------------------------------------------------------------------
// Mixing bus

export interface Bus {
  /** Dry input. */
  input: GainNode;
  /** Reverb send. */
  send: GainNode;
  /** Low-pass on everything (opened wide, closed for the slow motion). */
  muffle: BiquadFilterNode;
}
const buses = new WeakMap<BaseAudioContext, Bus>();

export function bus(c: BaseAudioContext): Bus {
  let b = buses.get(c);
  if (b) return b;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 10;
  comp.ratio.value = 5;
  comp.attack.value = 0.002;
  comp.release.value = 0.22;
  const muffle = c.createBiquadFilter();
  muffle.type = 'lowpass';
  muffle.frequency.value = 20000;
  muffle.Q.value = 0.8;
  const input = c.createGain();
  input.connect(muffle).connect(comp).connect(c.destination);
  const conv = c.createConvolver();
  conv.buffer = impulse(c, 2.4);
  const send = c.createGain();
  const wet = c.createGain();
  wet.gain.value = 0.4;
  send.connect(conv).connect(wet).connect(muffle);
  b = { input, send, muffle };
  buses.set(c, b);
  return b;
}

/** Reverb impulse: a few early reflections and a darkening tail (a room with wooden walls). */
function impulse(c: BaseAudioContext, dur: number): AudioBuffer {
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(2, n, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let y = 0;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      // one-pole low-pass, closing over time: the tail gets darker
      y += (0.85 - 0.75 * k) * (Math.random() * 2 - 1 - y);
      d[i] = y * (1 - k) ** 2.6;
    }
    for (const ms of [7, 13, 19, 29, 41]) {
      const i = Math.floor(((ms + ch * 2.3) / 1000) * c.sampleRate);
      d[i] += (Math.random() < 0.5 ? -1 : 1) * 0.5 * (1 - ms / 60);
    }
  }
  return buf;
}

// ---------------------------------------------------------------------------
// Noise

const whites = new WeakMap<BaseAudioContext, AudioBuffer>();
const browns = new WeakMap<BaseAudioContext, AudioBuffer>();

/** 2 s of white noise (long enough for its loop not to be heard). */
export function white(c: BaseAudioContext): AudioBuffer {
  let b = whites.get(c);
  if (!b) {
    b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    whites.set(c, b);
  }
  return b;
}

/** 2 s of brown noise: deep, smooth (rumbles, blasts). */
export function brown(c: BaseAudioContext): AudioBuffer {
  let b = browns.get(c);
  if (!b) {
    b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = b.getChannelData(0);
    let y = 0;
    for (let i = 0; i < d.length; i++) {
      y = (y + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = y * 3.5;
    }
    browns.set(c, b);
  }
  return b;
}

const noise = white;

/** The "clack" of a piece of wood landing on another one. */
export function clack(intensity = 1) {
  const c = ac();
  if (!c || muted) return;
  const now = c.currentTime;
  if (now - lastClack < 0.025) return;
  lastClack = now;
  const out = c.createGain();
  out.gain.value = 0.5 * intensity;
  out.connect(bus(c).input);

  // knock: short noise burst, resonant
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1500 + Math.random() * 900;
  bp.Q.value = 6;
  const g1 = c.createGain();
  g1.gain.setValueAtTime(0.9, now);
  g1.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
  src.connect(bp).connect(g1).connect(out);
  src.start(now);
  src.stop(now + 0.1);

  // body: resonance of the wood
  const osc = c.createOscillator();
  osc.type = 'sine';
  const f = 520 + Math.random() * 260;
  osc.frequency.setValueAtTime(f, now);
  osc.frequency.exponentialRampToValueAtTime(f * 0.7, now + 0.08);
  const g2 = c.createGain();
  g2.gain.setValueAtTime(0.55, now);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
  osc.connect(g2).connect(out);
  osc.start(now);
  osc.stop(now + 0.13);
}

/** Small marimba note. */
function marimba(c: BaseAudioContext, freq: number, t: number, vol = 0.25) {
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  g.connect(bus(c).input);
  for (const [mult, v] of [
    [1, 1],
    [4, 0.25],
    [10, 0.05]
  ] as const) {
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * mult;
    const og = c.createGain();
    og.gain.value = v;
    o.connect(og).connect(g);
    o.start(t);
    o.stop(t + 0.65);
  }
}

export function chime() {
  const c = ac();
  if (!c || muted) return;
  const t = c.currentTime;
  marimba(c, 784, t);
  marimba(c, 1175, t + 0.09);
}

export function fanfare() {
  const c = ac();
  if (!c || muted) return;
  const t = c.currentTime;
  [523, 659, 784, 1047, 784, 1047].forEach((f, i) => marimba(c, f, t + i * 0.12, 0.3));
}

export function bonk() {
  const c = ac();
  if (!c || muted) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(220, t);
  o.frequency.exponentialRampToValueAtTime(120, t + 0.12);
  const g = c.createGain();
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
  o.connect(g).connect(bus(c).input);
  o.start(t);
  o.stop(t + 0.16);
}

export function pop() {
  const c = ac();
  if (!c || muted) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(900, t);
  o.frequency.exponentialRampToValueAtTime(300, t + 0.08);
  const g = c.createGain();
  g.gain.setValueAtTime(0.2, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
  o.connect(g).connect(bus(c).input);
  o.start(t);
  o.stop(t + 0.11);
}
