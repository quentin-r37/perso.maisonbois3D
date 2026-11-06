export type Kind = 'log' | 'insert' | 'gable' | 'floor' | 'decor' | 'batten' | 'roof' | 'ridge' | 'chimney';
export type Paint = 'wood' | 'light' | 'orange' | 'white' | 'green' | 'red' | 'yellow' | 'dark' | 'blue' | 'skin' | 'hair';
export type Category = 'rondins' | 'ouvertures' | 'toit' | 'deco';

export interface PieceDef {
  id: string;
  name: string;
  kind: Kind;
  category: Category;
  /** Length along the axis, in G (logs: position of the last notch; ridge caps/chimney: in half-plates). */
  length: number;
  /** Perpendicular depth (floors). */
  depth: number;
  /** Logs: positions of the notches (in G, from the origin). */
  notches?: number[];
  /** Height in quarters (Q). */
  h: number;
  /** Notch depth on top / underneath, in Q. */
  topNotch: number;
  bottomNotch: number;
  paint: Paint;
  /** Number of distinct rotations (1 = none, 2 = X/Z axis, 4 = axis + facing). */
  rotations: 1 | 2 | 4;
}

const base = { depth: 0, h: 0, topNotch: 0, bottomNotch: 0, length: 0, rotations: 1 as const };

/**
 * Only three kinds of logs, like in the real kit. The long one is NOT two mediums:
 * its middle notch is off-center (3 + 5).
 */
export const CATALOG: PieceDef[] = [
  {
    ...base,
    id: 'small',
    name: 'Small log',
    kind: 'log',
    category: 'rondins',
    length: 0,
    notches: [0],
    h: 4,
    topNotch: 1,
    bottomNotch: 1,
    paint: 'wood',
    rotations: 2
  },
  {
    ...base,
    id: 'medium',
    name: 'Medium log',
    kind: 'log',
    category: 'rondins',
    length: 5,
    notches: [0, 5],
    h: 4,
    topNotch: 1,
    bottomNotch: 1,
    paint: 'wood',
    rotations: 2
  },
  {
    ...base,
    id: 'long',
    name: 'Long log',
    kind: 'log',
    category: 'rondins',
    length: 8,
    notches: [0, 3, 8],
    h: 4,
    topNotch: 1,
    bottomNotch: 1,
    paint: 'wood',
    rotations: 4
  },
  {
    ...base,
    id: 'door',
    name: 'Door',
    kind: 'insert',
    category: 'ouvertures',
    length: 3,
    h: 20,
    paint: 'red',
    rotations: 4
  },
  {
    ...base,
    id: 'window',
    name: 'Window',
    kind: 'insert',
    category: 'ouvertures',
    length: 3,
    h: 12,
    paint: 'red',
    rotations: 4
  },
  {
    ...base,
    id: 'gable',
    name: 'Gable',
    kind: 'gable',
    category: 'toit',
    length: 5,
    notches: [0, 5],
    h: 4,
    bottomNotch: 1,
    paint: 'yellow',
    rotations: 2
  },
  // two lengths: gables 5 steps apart (medium walls) or 8 steps apart (long walls)
  { ...base, id: 'batten', name: 'Roof beam', kind: 'batten', category: 'toit', length: 5, paint: 'orange' },
  { ...base, id: 'batten-long', name: 'Long roof beam', kind: 'batten', category: 'toit', length: 8, paint: 'orange' },
  { ...base, id: 'roof-plank', name: 'Roof plank', kind: 'roof', category: 'toit', paint: 'green' },
  { ...base, id: 'ridge-long', name: 'Long ridge cap', kind: 'ridge', category: 'toit', length: 4, paint: 'red' },
  { ...base, id: 'ridge-short', name: 'Short ridge cap', kind: 'ridge', category: 'toit', length: 2, paint: 'red' },
  { ...base, id: 'chimney', name: 'Chimney', kind: 'chimney', category: 'toit', length: 1, paint: 'red' },
  {
    ...base,
    id: 'floor',
    name: 'Floor',
    kind: 'floor',
    category: 'toit',
    length: 5,
    depth: 2,
    h: 1,
    paint: 'green',
    rotations: 2
  },
  { ...base, id: 'tree', name: 'Fir tree', kind: 'decor', category: 'deco', h: 16, paint: 'green', rotations: 4 },
  { ...base, id: 'figurine', name: 'Little character', kind: 'decor', category: 'deco', h: 10, paint: 'red', rotations: 4 }
];

const BY_ID = new Map(CATALOG.map((d) => [d.id, d]));

export function getDef(id: string): PieceDef {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`Unknown piece: ${id}`);
  return d;
}

export function hasDef(id: string): boolean {
  return BY_ID.has(id);
}

export const isRoofKind = (k: Kind) => k === 'batten' || k === 'roof' || k === 'ridge' || k === 'chimney';

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'rondins', label: 'Logs' },
  { id: 'ouvertures', label: 'Doors & windows' },
  { id: 'toit', label: 'Roof & floor' },
  { id: 'deco', label: 'Decor' }
];
