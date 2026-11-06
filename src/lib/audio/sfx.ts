/** Sounds synthesized with Web Audio (no audio files). */
let ctx: AudioContext | null = null;
let muted = false;
let lastClack = 0;

export function setMuted(m: boolean) {
  muted = m;
}

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
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

let noiseBuf: AudioBuffer | null = null;
function noise(c: AudioContext) {
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate * 0.2, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** The "clack" of a piece of wood landing on another one. */
export function clack(intensity = 1) {
  const c = ac();
  if (!c || muted) return;
  const now = c.currentTime;
  if (now - lastClack < 0.025) return;
  lastClack = now;
  const out = c.createGain();
  out.gain.value = 0.5 * intensity;
  out.connect(c.destination);

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
function marimba(c: AudioContext, freq: number, t: number, vol = 0.25) {
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  g.connect(c.destination);
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
  o.connect(g).connect(c.destination);
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
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + 0.11);
}
