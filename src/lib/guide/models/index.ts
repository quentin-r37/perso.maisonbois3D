import type { Model } from './helpers';
import { cabane } from './cabane';
import { longChalet } from './long-chalet';
import { petitChalet } from './petit-chalet';

/** Ordered from the easiest to the biggest. The first one is the default. */
export const MODELS: Model[] = [petitChalet, cabane, longChalet].sort((a, b) => a.level - b.level);

/** The model the booklet opened on before there was a choice (its saved progress belongs to it). */
export const DEFAULT_MODEL_ID = petitChalet.id;

export function getModel(id: string): Model {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

export type { Model, Step } from './helpers';
