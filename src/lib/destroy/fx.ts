/**
 * Visual "juice" of a demolition, shared between the physics effects and the scene:
 * particle bursts (drained by DemolitionFx), screen shake and slow motion.
 */
import type { Vec3 } from './world';

export type FxEvent =
  /** Explosion: flash + fireball + splinters + dust. */
  | { kind: 'blast'; p: Vec3; power: number }
  /** A few dust puffs (impacts, quake). */
  | { kind: 'dust'; p: Vec3; n: number; spread?: number }
  /** Tornado swirl: dust launched tangentially around a vertical axis. */
  | { kind: 'swirl'; p: Vec3; v: Vec3; size: number };

export const fx = {
  events: [] as FxEvent[],
  /** Screen shake amplitude (0..1), decays by itself. */
  shake: 0,
  /** Slow motion: time scale `scale` held for `hold` s, then back to 1 over `ramp` s. */
  slow: { scale: 1, hold: 0, ramp: 0, t: Infinity }
};

export function emit(e: FxEvent) {
  if (fx.events.length < 400) fx.events.push(e);
}

export function kick(amount: number) {
  fx.shake = Math.min(1, fx.shake + amount);
}

export function slowmo(scale: number, hold: number, ramp: number) {
  fx.slow = { scale, hold, ramp, t: 0 };
}

/** Current time scale; advances the slow motion clock by `dt` (real seconds). */
export function timeScale(dt: number): number {
  const s = fx.slow;
  if (s.t === Infinity) return 1;
  s.t += dt;
  if (s.t < s.hold) return s.scale;
  const k = (s.t - s.hold) / Math.max(s.ramp, 1e-3);
  if (k >= 1) {
    s.t = Infinity;
    return 1;
  }
  // ease-in back to normal speed
  return s.scale + (1 - s.scale) * k * k;
}

export function resetFx() {
  fx.events.length = 0;
  fx.shake = 0;
  fx.slow = { scale: 1, hold: 0, ramp: 0, t: Infinity };
}
