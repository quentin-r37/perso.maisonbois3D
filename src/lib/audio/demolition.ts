/**
 * Sounds of the demolition, synthesized (no audio files):
 * wood impacts (modal synthesis: a few inharmonic partials, like a struck block of wood),
 * explosions in layers, wind, earthquake, and the rewind of the rebuild.
 */
import { ac, brown, bus, white } from './sfx';

export type Stop = () => void;
const noop: Stop = () => {};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const tau = 0.0001;

// ---------------------------------------------------------------------------
// Voice budget: a tornado on a pile of loose pieces is hundreds of hits per second.
// Without a limit, thousands of audio nodes get created per second: the audio thread
// can't keep up (crackling), then goes silent.

interface Voice {
  start: number;
  end: number;
  /** Roughly how many sources (oscillators, noises) it plays. */
  cost: number;
  /** What plugs it into the bus. */
  plugs: AudioNode[];
}
const voices = new WeakMap<BaseAudioContext, Voice[]>();
/** Above this, soft hits and splinters are dropped. */
const BUSY = 100;
/** Above this, no more hits at all. */
const FULL = 200;

/** Sources sounding right now. What is over gets unplugged from the bus. */
function load(c: BaseAudioContext): number {
  const list = voices.get(c);
  if (!list) return 0;
  const now = c.currentTime;
  let n = 0;
  let keep = 0;
  for (const v of list) {
    if (v.end > now) {
      list[keep++] = v;
      if (v.start <= now) n += v.cost;
    } else for (const p of v.plugs) p.disconnect();
  }
  list.length = keep;
  return n;
}

/**
 * Output of a sound: gain → panner → bus, with an optional reverb send.
 * `end`: time at which the sound is over (it is unplugged then); `cost`: its number of sources.
 */
function output(c: BaseAudioContext, gain: number, pan: number, send: number, end: number, cost = 1, start = c.currentTime): GainNode {
  const b = bus(c);
  const g = c.createGain();
  g.gain.value = gain;
  const p = c.createStereoPanner();
  p.pan.value = clamp(pan, -1, 1);
  g.connect(p).connect(b.input);
  const plugs: AudioNode[] = [p];
  if (send > 0) {
    const s = c.createGain();
    s.gain.value = send;
    p.connect(s).connect(b.send);
    plugs.push(s);
  }
  let list = voices.get(c);
  if (!list) voices.set(c, (list = []));
  list.push({ start, end: end + 0.1, cost, plugs });
  return g;
}

/** Attack / exponential decay envelope on a gain. */
function env(g: AudioParam, t: number, attack: number, peak: number, end: number) {
  g.setValueAtTime(tau, t);
  g.exponentialRampToValueAtTime(Math.max(peak, tau * 2), t + attack);
  g.exponentialRampToValueAtTime(tau, end);
}

interface Burst {
  type: BiquadFilterType;
  freq: number;
  /** Filter frequency at the end of the burst (sweep). */
  freqEnd?: number;
  q?: number;
  dur: number;
  gain: number;
  attack?: number;
  noise?: 'white' | 'brown';
}

/** Filtered noise burst. */
function burst(c: BaseAudioContext, out: AudioNode, t: number, o: Burst) {
  const src = c.createBufferSource();
  src.buffer = o.noise === 'brown' ? brown(c) : white(c);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = o.type;
  f.Q.value = o.q ?? 0.8;
  f.frequency.setValueAtTime(o.freq, t);
  if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + o.dur);
  const g = c.createGain();
  env(g.gain, t, o.attack ?? 0.002, o.gain, t + o.dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + o.dur + 0.05);
}

const WOOD = { ratios: [1, 2.32, 4.25, 6.63], gains: [1, 0.42, 0.2, 0.08] };

/**
 * Struck wood: a few inharmonic partials, the high ones dying first.
 * `bright` 0..1: a soft touch barely excites the upper partials, a hard blow rings them all.
 */
function modal(c: BaseAudioContext, out: AudioNode, t: number, f: number, gain: number, decay: number, bright = 1) {
  WOOD.ratios.forEach((r, i) => {
    const fr = f * r * rand(0.985, 1.015);
    if (fr > 16000) return;
    const level = gain * WOOD.gains[i] * bright ** i;
    if (level < 0.004) return;
    const o = c.createOscillator();
    o.frequency.value = fr;
    const g = c.createGain();
    const d = decay / (1 + i * 0.9);
    env(g.gain, t, 0.0015, level, t + d);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + d + 0.02);
  });
}

/** Soft saturation curve (adds harmonics: the thump is heard on small speakers too). */
function drive(c: BaseAudioContext, k: number): WaveShaperNode {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  const ws = c.createWaveShaper();
  ws.curve = curve;
  ws.oversample = '2x';
  return ws;
}

// ---------------------------------------------------------------------------
// Impacts

/** Times of the last hits, per audio context (limiter). */
const recentHits = new WeakMap<BaseAudioContext, number[]>();
/** Time of the last hit that cracked the wood, per audio context. */
const lastCrack = new WeakMap<BaseAudioContext, number>();

export interface ImpactSound {
  /** Speed at which the two met (m/s): 0.3 = a touch, 2 = a knock, 6+ = a heavy fall. */
  speed: number;
  /** Mass of the heaviest piece: big pieces sound lower, ring longer, thump. */
  mass: number;
  /** What it hit: another piece or the table. */
  surface?: 'wood' | 'table';
  /** -1 (left) .. 1 (right) */
  pan?: number;
  /** Distance to the camera. */
  dist?: number;
}

/**
 * A piece hits something. Everything follows the impact speed and the mass:
 * a touch is a soft, dull tick; a heavy fall is loud, bright, with a deep thump
 * (and the wood cracks on the hardest ones).
 */
export function impact({ speed, mass, surface = 'wood', pan = 0, dist = 10 }: ImpactSound) {
  const c = ac();
  if (!c) return;
  const now = c.currentTime;
  const recent = (recentHits.get(c) ?? []).filter((t) => now - t < 0.1);
  recentHits.set(c, recent);
  // no machine gun: at most 8 hits per 100 ms, the soft ones go first
  if (recent.length >= 8 || (recent.length >= 4 && speed < 1.5)) return;
  // already a lot going on: only the big hits, then nothing more
  const busy = load(c);
  if (busy >= FULL || (busy >= BUSY && speed < 3)) return;
  recent.push(now);

  const t = now + Math.random() * 0.006;
  const hard = clamp(speed / 6, 0, 1);
  const heavy = clamp(Math.sqrt(mass / 0.6), 0.45, 1.5);
  const loud = clamp(speed / 6, 0.02, 1.3) ** 0.7 * (0.55 + 0.45 * heavy);
  const far = 1 / (1 + Math.max(0, dist - 7) * 0.06);

  // soft blows are dull: the whole voice goes through a low-pass that opens with the speed
  const thump = mass > 0.3 && speed > 2.5;
  const out = output(c, 1.5 * loud * far, pan * 0.8, 0.12 + 0.2 * hard, t + (thump ? 0.4 : 0.3), thump ? 7 : 6);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700 + 11000 * hard ** 1.4;
  lp.Q.value = 0.5;
  lp.connect(out);

  const f0 = (470 / Math.sqrt(0.35 + mass)) * rand(0.92, 1.08);
  const bright = 0.2 + 0.8 * hard;
  const ring = (0.05 + mass * 0.08) * (0.45 + 0.8 * hard);
  if (surface === 'table') {
    // the table: a big board, a dull thud (deeper and longer the harder it is hit)
    burst(c, lp, t, {
      type: 'lowpass',
      freq: 180 + 380 * hard,
      freqEnd: 90,
      dur: 0.05 + 0.13 * hard,
      gain: 1.4,
      noise: 'brown'
    });
    modal(c, lp, t, rand(125, 165), 0.45 * hard, 0.12 + 0.1 * hard, 0.3);
    modal(c, lp, t, f0, 0.4, ring * 0.8, bright);
  } else {
    modal(c, lp, t, f0, 0.7, ring, bright);
  }
  // the knock (contact of two hard surfaces): only when it is a real blow
  if (hard > 0.12) burst(c, lp, t, { type: 'bandpass', freq: 1300 + 2600 * hard, q: 1.3, dur: 0.006 + 0.012 * hard, gain: 0.6 * hard });
  // heavy piece, hard fall: a deep thump, felt in the stomach
  if (thump) {
    const k = clamp((speed - 2.5) / 5, 0, 1) * clamp(mass, 0.3, 1.2);
    const o = c.createOscillator();
    o.frequency.setValueAtTime(130 / Math.sqrt(0.5 + mass), t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
    const g = c.createGain();
    env(g.gain, t, 0.003, 0.9 * k, t + 0.2 + 0.12 * mass);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.4);
  }
  // the hardest blows: the wood cracks
  // (not all of them: in a tornado everything goes that fast)
  if (speed > 7 && busy < BUSY && now - (lastCrack.get(c) ?? -1) > 0.08) {
    lastCrack.set(c, now);
    splinters(c, t, 2 + Math.round(clamp(speed - 7, 0, 6)), 0.03, 0.25 * far);
  }
}

// ---------------------------------------------------------------------------
// Friction: one continuous voice per kind of contact, following how much is sliding

/**
 * Wood rubbing (pieces sliding on each other, or on the table): grainy noise whose
 * level follows the pressure x sliding speed, and pitch / grain speed the sliding speed.
 */
export class Rub {
  #c: BaseAudioContext | null = null;
  #level: GainNode | null = null;
  #band: BiquadFilterNode | null = null;
  #pan: StereoPannerNode | null = null;
  #grain: AudioBufferSourceNode | null = null;
  #sources: AudioScheduledSourceNode[] = [];
  readonly table: boolean;

  constructor(surface: 'wood' | 'table') {
    this.table = surface === 'table';
  }

  #build(c: BaseAudioContext) {
    this.#c = c;
    const b = bus(c);
    const level = c.createGain();
    level.gain.value = 0;
    const pan = c.createStereoPanner();
    level.connect(pan).connect(b.input);
    const send = c.createGain();
    send.gain.value = 0.15;
    pan.connect(send).connect(b.send);

    // the grain: amplitude jitter (stick-slip), driven by slow noise
    const grainGain = c.createGain();
    grainGain.gain.value = 0.6;
    const grain = c.createBufferSource();
    grain.buffer = brown(c);
    grain.loop = true;
    const depth = c.createGain();
    depth.gain.value = 0.8;
    grain.connect(depth).connect(grainGain.gain);
    grainGain.connect(level);

    const src = c.createBufferSource();
    src.buffer = white(c);
    src.loop = true;
    const band = c.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = this.table ? 0.9 : 1.3;
    band.frequency.value = 800;
    // a bit of wooden body on the rub between pieces
    const body = c.createBiquadFilter();
    body.type = 'peaking';
    body.frequency.value = this.table ? 300 : 900;
    body.Q.value = 3;
    body.gain.value = 6;
    // wood rubbing is a mid-range sound, not a hiss
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = this.table ? 1400 : 2400;
    lp.Q.value = 0.5;
    src.connect(band).connect(body).connect(lp).connect(grainGain);

    const t = c.currentTime;
    src.start(t, Math.random());
    grain.start(t, Math.random());
    this.#sources = [src, grain];
    this.#level = level;
    this.#band = band;
    this.#pan = pan;
    this.#grain = grain;
  }

  /** `power`: pressure x sliding speed summed over the contacts (0 = nothing slides). */
  update(power: number, speed: number, pan = 0, dist = 10) {
    const c = ac();
    if (!c) {
      // muted: fade out what is playing
      if (this.#level && this.#c) this.#level.gain.setTargetAtTime(0, this.#c.currentTime, 0.05);
      return;
    }
    if (this.#c !== c) this.#build(c);
    const t = c.currentTime;
    const far = 1 / (1 + Math.max(0, dist - 7) * 0.06);
    const v = clamp(speed / 3, 0, 1);
    const level = (1 - Math.exp(-power / 25)) * far * (this.table ? 0.4 : 0.35);
    this.#level!.gain.setTargetAtTime(level, t, level > this.#level!.gain.value ? 0.03 : 0.08);
    this.#band!.frequency.setTargetAtTime(this.table ? 180 + 600 * v : 320 + 1100 * v, t, 0.06);
    this.#pan!.pan.setTargetAtTime(clamp(pan * 0.8, -1, 1), t, 0.1);
    // faster sliding = faster grain
    this.#grain!.playbackRate.setTargetAtTime(0.4 + 2.2 * v, t, 0.1);
  }

  stop() {
    const c = this.#c;
    if (!c || !this.#level) return;
    const t = c.currentTime;
    this.#level.gain.setTargetAtTime(0, t, 0.05);
    for (const s of this.#sources) s.stop(t + 0.4);
    this.#c = null;
    this.#level = null;
  }
}

/** Tiny cracks of splintering wood, scattered over time. */
function splinters(c: BaseAudioContext, t0: number, n: number, spread: number, gain: number) {
  for (let i = 0; i < n; i++) {
    const t = t0 + 0.02 - Math.log(1 - Math.random() * 0.98) * spread;
    const out = output(c, gain * rand(0.3, 1), rand(-0.85, 0.85), 0.25, t + 0.1, 5, t);
    modal(c, out, t, rand(1100, 2900), 0.5, rand(0.025, 0.07));
    burst(c, out, t, { type: 'highpass', freq: rand(2500, 5000), dur: rand(0.006, 0.02), gain: 0.6 });
  }
}

// ---------------------------------------------------------------------------
// Explosion

/**
 * Explosion in layers: crack (transient), punch (saturated falling sine), body (noise
 * closing down), tail (deep rumble, in the reverb), then splinters raining down.
 * `power` 0..1 (the big explosion is 1, a bomb ~0.55).
 */
export function explosion(power = 1, pan = 0) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + 0.005;
  const p = clamp(power, 0.2, 1);
  const busy = load(c);
  const out = output(c, 0.9, pan * 0.6, 0.5, t + 1.2 + 1.3 * p, 5);

  // crack
  burst(c, out, t, { type: 'highpass', freq: 1400, dur: 0.05, gain: 0.8 * p, attack: 0.001 });

  // punch
  const o = c.createOscillator();
  o.frequency.setValueAtTime(150 - 40 * p, t);
  o.frequency.exponentialRampToValueAtTime(36, t + 0.45);
  const og = c.createGain();
  env(og.gain, t, 0.004, 0.55 + 0.45 * p, t + 0.5 + 0.6 * p);
  const sat = drive(c, 2.6);
  const satOut = c.createGain();
  satOut.gain.value = 0.9;
  o.connect(og).connect(sat).connect(satOut).connect(out);
  o.start(t);
  o.stop(t + 1.2 + 0.6 * p);

  // body: two decorrelated noises, left and right, closing down
  for (const side of [-1, 1]) {
    const pan2 = c.createStereoPanner();
    pan2.pan.value = side * 0.45;
    pan2.connect(out);
    burst(c, pan2, t, {
      type: 'lowpass',
      freq: 2600 + 2400 * p,
      freqEnd: 150,
      q: 0.9,
      dur: 1.1 + 1.3 * p,
      gain: 0.9 * p,
      attack: 0.01,
      noise: 'brown'
    });
  }
  // air of the blast: short white whoosh
  burst(c, out, t, { type: 'lowpass', freq: 8000, freqEnd: 500, dur: 0.35 + 0.25 * p, gain: 0.35 * p, attack: 0.003 });

  // tail: deep rumble, rolling around in the reverb
  const tail = output(c, 0.7 * p, 0, 0.9, t + 2.3 + 1.8 * p);
  burst(c, tail, t + 0.05, { type: 'lowpass', freq: 110, dur: 2.2 + 1.8 * p, gain: 1, attack: 0.25, noise: 'brown' });

  // bombs in a row: the splinters of the previous ones are still raining, fewer new ones
  splinters(c, t, Math.round((8 + 22 * p) * clamp(1 - busy / FULL, 0.25, 1)), 0.08 + 0.2 * p, 0.4);
}

/**
 * Slow motion: everything sounds muffled (as if stunned by the blast), then opens up again.
 * Same timing as the visual slow motion (real seconds).
 */
export function muffle(hold: number, ramp: number, depth = 600) {
  const c = ac();
  if (!c) return;
  const f = bus(c).muffle.frequency;
  const t = c.currentTime;
  f.cancelScheduledValues(t);
  f.setValueAtTime(f.value, t);
  // let the crack through, then close
  f.setValueAtTime(20000, t + 0.04);
  f.exponentialRampToValueAtTime(depth, t + 0.1);
  f.setValueAtTime(depth, t + 0.1 + hold);
  f.exponentialRampToValueAtTime(20000, t + 0.1 + hold + ramp);
}

// ---------------------------------------------------------------------------
// Continuous sounds (they can be stopped: rebuild before the end)

/** Random walk of a parameter, scheduled ahead with smooth transitions. */
function wander(p: AudioParam, t: number, dur: number, step: number, lo: number, hi: number, smooth = step / 3) {
  for (let s = 0; s < dur; s += step * rand(0.6, 1.4)) p.setTargetAtTime(rand(lo, hi), t + s, smooth);
}

function stopper(c: BaseAudioContext, master: GainNode, sources: AudioScheduledSourceNode[]): Stop {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const t = c.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(0, t + 0.25);
    for (const s of sources) {
      try {
        s.stop(t + 0.3);
      } catch {
        /* already stopped */
      }
    }
  };
}

/** Looping noise through a filter into `out`. */
function noiseLoop(c: BaseAudioContext, out: AudioNode, kind: 'white' | 'brown', type: BiquadFilterType, freq: number, q = 0.8) {
  const src = c.createBufferSource();
  src.buffer = kind === 'brown' ? brown(c) : white(c);
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  src.connect(f).connect(out);
  return { src, filter: f };
}

/** Tornado: roaring wind with gusts, a howl and a whistle wandering around, debris whooshing by. */
export function wind(dur = 5): Stop {
  const c = ac();
  if (!c) return noop;
  const t = c.currentTime;
  const master = output(c, 1, 0, 0.35, t + dur + 0.1, 5);
  const level = 0.65;
  master.gain.setValueAtTime(0, t);
  master.gain.linearRampToValueAtTime(level, t + 1.2);
  master.gain.setValueAtTime(level, t + dur - 1.2);
  master.gain.linearRampToValueAtTime(0, t + dur);
  const pan = c.createStereoPanner();
  pan.connect(master);
  wander(pan.pan, t, dur, 0.6, -0.5, 0.5);
  const gust = c.createGain();
  gust.connect(pan);
  wander(gust.gain, t, dur, 0.35, 0.45, 1);

  const sources: AudioScheduledSourceNode[] = [];
  const layer = (gain: number) => {
    const g = c.createGain();
    g.gain.value = gain;
    g.connect(gust);
    return g;
  };
  // roar
  const roar = noiseLoop(c, layer(0.9), 'brown', 'lowpass', 380);
  // howl
  const howl = noiseLoop(c, layer(0.35), 'white', 'bandpass', 600, 6);
  wander(howl.filter.frequency, t, dur, 0.5, 350, 950);
  // whistle
  const whistle = noiseLoop(c, layer(0.08), 'white', 'bandpass', 1700, 28);
  wander(whistle.filter.frequency, t, dur, 0.7, 1300, 2300);
  for (const n of [roar, howl, whistle]) {
    n.src.start(t, Math.random());
    n.src.stop(t + dur + 0.1);
    sources.push(n.src);
  }
  // debris flying by: short swept whooshes, left to right or back
  for (let s = 0.8; s < dur - 0.8; s += rand(0.35, 0.8)) {
    const tt = t + s;
    const side = Math.random() < 0.5 ? -1 : 1;
    const p2 = c.createStereoPanner();
    p2.pan.setValueAtTime(-0.8 * side, tt);
    p2.pan.linearRampToValueAtTime(0.8 * side, tt + 0.4);
    p2.connect(master);
    const src = c.createBufferSource();
    src.buffer = white(c);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(400, tt);
    f.frequency.exponentialRampToValueAtTime(rand(1500, 2600), tt + 0.18);
    f.frequency.exponentialRampToValueAtTime(350, tt + 0.42);
    const g = c.createGain();
    g.gain.setValueAtTime(0, tt);
    g.gain.linearRampToValueAtTime(rand(0.08, 0.2), tt + 0.18);
    g.gain.linearRampToValueAtTime(0, tt + 0.42);
    src.connect(f).connect(g).connect(p2);
    src.start(tt, Math.random());
    src.stop(tt + 0.45);
    sources.push(src);
  }
  return stopper(c, master, sources);
}

/** Wood groaning under stress: a rough low tone with a jittery pitch, through a resonance. */
function creak(c: BaseAudioContext, t: number, gain: number, pan: number, sources: AudioScheduledSourceNode[], out: AudioNode) {
  const d = rand(0.25, 0.7);
  const o = c.createOscillator();
  o.type = 'sawtooth';
  const f = rand(65, 140);
  o.frequency.setValueAtTime(f, t);
  o.frequency.linearRampToValueAtTime(f * rand(0.8, 1.25), t + d);
  const jit = c.createOscillator();
  jit.frequency.value = rand(14, 30);
  const jg = c.createGain();
  jg.gain.value = f * 0.12;
  jit.connect(jg).connect(o.frequency);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = rand(650, 1300);
  bp.Q.value = 4;
  const g = c.createGain();
  g.gain.setValueAtTime(tau, t);
  g.gain.exponentialRampToValueAtTime(gain, t + d * 0.3);
  g.gain.exponentialRampToValueAtTime(tau, t + d);
  const p = c.createStereoPanner();
  p.pan.value = pan;
  o.connect(bp).connect(g).connect(p).connect(out);
  for (const s of [o, jit]) {
    s.start(t);
    s.stop(t + d + 0.02);
    sources.push(s);
  }
}

/** Earthquake: deep rumble and a throbbing sub, the logs groaning and cracking. */
export function quake(dur = 4): Stop {
  const c = ac();
  if (!c) return noop;
  const t = c.currentTime;
  const master = output(c, 1, 0, 0.3, t + dur + 0.1, 8);
  const level = 0.32;
  master.gain.setValueAtTime(tau, t);
  master.gain.exponentialRampToValueAtTime(level, t + 0.3);
  master.gain.setValueAtTime(level, t + dur * 0.35);
  master.gain.exponentialRampToValueAtTime(tau, t + dur);
  const sources: AudioScheduledSourceNode[] = [];

  // rumble
  const rg = c.createGain();
  rg.gain.value = 1.2;
  rg.connect(master);
  const rumble = noiseLoop(c, rg, 'brown', 'lowpass', 130, 1.2);
  rumble.src.start(t, Math.random());
  rumble.src.stop(t + dur + 0.1);
  sources.push(rumble.src);

  // throbbing sub (felt more than heard)
  const sub = c.createGain();
  sub.gain.value = 0.25;
  const am = c.createOscillator();
  am.frequency.value = 6.5;
  const amg = c.createGain();
  amg.gain.value = 0.2;
  am.connect(amg).connect(sub.gain);
  sub.connect(master);
  for (const f of [36, 49]) {
    const o = c.createOscillator();
    o.frequency.value = f;
    o.connect(sub);
    o.start(t);
    o.stop(t + dur + 0.1);
    sources.push(o);
  }
  am.start(t);
  am.stop(t + dur + 0.1);
  sources.push(am);

  // the chalet groans, then cracks
  const fx = c.createGain();
  fx.connect(master);
  for (let s = 0.2; s < dur - 0.4; s += rand(0.2, 0.55)) creak(c, t + s, rand(0.15, 0.4), rand(-0.7, 0.7), sources, fx);
  for (let s = 0.6; s < dur - 0.5; s += rand(0.35, 0.9)) {
    const out = c.createStereoPanner();
    out.pan.value = rand(-0.7, 0.7);
    out.connect(fx);
    burst(c, out, t + s, { type: 'highpass', freq: rand(1500, 3000), dur: rand(0.02, 0.05), gain: rand(0.25, 0.5), attack: 0.001 });
    modal(c, out, t + s, rand(500, 900), 0.3, 0.12);
  }
  return stopper(c, master, sources);
}

// ---------------------------------------------------------------------------
// Rebuild

/** Rewind: a reversed swell (rises and stops dead when everything is back). */
export function rewind(dur: number): Stop {
  const c = ac();
  if (!c) return noop;
  const t = c.currentTime;
  const master = output(c, 0.45, 0, 0.3, t + dur + 0.1);
  const g = c.createGain();
  g.gain.setValueAtTime(tau, t);
  g.gain.exponentialRampToValueAtTime(1, t + dur);
  g.gain.setValueAtTime(1, t + dur);
  g.gain.linearRampToValueAtTime(0, t + dur + 0.04);
  g.connect(master);
  const n = noiseLoop(c, g, 'white', 'bandpass', 300, 1.5);
  n.filter.frequency.setValueAtTime(250, t);
  n.filter.frequency.exponentialRampToValueAtTime(4000, t + dur);
  n.src.start(t, Math.random());
  n.src.stop(t + dur + 0.1);
  return stopper(c, master, [n.src]);
}

/** Pentatonic scale (C major), 2 octaves and a bit. */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28].map((s) => 523.25 * 2 ** (s / 12));
let lastSnap = -Infinity;

/**
 * A piece snapping back into place: a wood block note going up the scale as the
 * chalet rebuilds itself (`progress` 0..1).
 */
export function snap(progress: number, pan = 0) {
  const c = ac();
  if (!c) return;
  const now = c.currentTime;
  if (now - lastSnap < 0.045) return;
  lastSnap = now;
  const f = SCALE[Math.min(SCALE.length - 1, Math.floor(clamp(progress, 0, 1) * SCALE.length))];
  load(c);
  const out = output(c, 0.9, pan * 0.6, 0.25, now + 0.2, 5);
  modal(c, out, now, f, 0.8, 0.16);
  burst(c, out, now, { type: 'bandpass', freq: 3000, q: 1.2, dur: 0.01, gain: 0.3 });
}
