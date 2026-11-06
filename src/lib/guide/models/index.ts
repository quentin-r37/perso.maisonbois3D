import type { Model } from './helpers';
import { petitChalet } from './petit-chalet';

export const MODELS: Model[] = [petitChalet];

export function getModel(id: string): Model {
  return MODELS.find((m) => m.id === id) ?? MODELS[0];
}

export type { Model, Step } from './helpers';
