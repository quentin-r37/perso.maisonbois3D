import type { Rapier } from './world';

let loading: Promise<Rapier> | null = null;

/** Loads the physics engine (WASM, ~1 MB) on first use only. */
export function loadRapier(): Promise<Rapier> {
  loading ??= import('@dimforge/rapier3d-compat').then(async (m) => {
    const R = (m.default ?? m) as Rapier;
    await R.init();
    return R;
  });
  return loading;
}
