import { G } from '../build/grid';

export type Kind = 'log' | 'insert' | 'gable' | 'floor' | 'decor' | 'batten' | 'roof' | 'ridge' | 'chimney';
export type Paint = 'wood' | 'black' | 'light' | 'orange' | 'white' | 'green' | 'red' | 'yellow' | 'dark' | 'blue' | 'skin' | 'hair' | 'grey' | 'purple' | 'slate' | 'auburn' | 'iron';
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
  /** Crenel log: depth (in Q) of the extra notches cut in the top of the log. */
  teeth?: number;
  /** Cut log (arrow slit): local x (world units) of its flat, sawn end. */
  cut?: number;
  /** Same shape as this other piece, only painted another color (black logs and floors). */
  shape?: string;
}

/** Arrow slit, in world units: width of the upright and of the arms of the cross. */
const SLIT = 0.24;
const CROSS_ARM = 0.9;
/** Middle of a medium wall (world units from the corner notch). */
const MID = (5 * G) / 2;

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
  // Medieval: the very same medium log, painted black like the crenel log.
  {
    ...base,
    id: 'medium-dark',
    shape: 'medium',
    name: 'Dark medium log',
    kind: 'log',
    category: 'rondins',
    length: 5,
    notches: [0, 5],
    h: 4,
    topNotch: 1,
    bottomNotch: 1,
    paint: 'black',
    rotations: 2
  },
  // Castle. The crenel log is nothing more than a medium log with three more notches cut
  // in its top (standard notches, no deeper), evenly spaced between the corners.
  // Facing -1 = laid upside down: the crenels open underneath, over the logs laid across.
  {
    ...base,
    id: 'crenel',
    name: 'Crenel log',
    kind: 'log',
    category: 'rondins',
    length: 5,
    notches: [0, 5],
    h: 4,
    teeth: 1,
    topNotch: 1,
    bottomNotch: 1,
    paint: 'black',
    rotations: 4
  },
  // Arrow slit: two cut logs (one notch at the corner, sawn off before the middle of a
  // medium wall), laid in pairs facing each other. The slit one leaves a narrow gap
  // (the upright of the cross), the wide one the arms of the cross.
  {
    ...base,
    id: 'cut-slit',
    name: 'Cut log (slit)',
    kind: 'log',
    category: 'rondins',
    length: 5,
    notches: [0],
    h: 4,
    cut: MID - SLIT / 2,
    topNotch: 1,
    bottomNotch: 1,
    paint: 'wood',
    rotations: 4
  },
  {
    ...base,
    id: 'cut-wide',
    name: 'Cut log (wide)',
    kind: 'log',
    category: 'rondins',
    length: 5,
    notches: [0],
    h: 4,
    cut: MID - CROSS_ARM / 2,
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
    // 6 courses of logs high
    h: 24,
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
    // 4 courses of logs high
    h: 16,
    paint: 'red',
    rotations: 4
  },
  // Medieval openings, same size as the door and the window: a double door of wooden
  // planks held by iron straps, and an iron grille, their frames painted black like the crenel log.
  {
    ...base,
    id: 'door-castle',
    name: 'Wooden double door',
    kind: 'insert',
    category: 'ouvertures',
    length: 3,
    h: 24,
    paint: 'wood',
    rotations: 4
  },
  {
    ...base,
    id: 'grille',
    name: 'Window grille',
    kind: 'insert',
    category: 'ouvertures',
    length: 3,
    h: 16,
    paint: 'iron',
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
    // asymmetric board (front edge / notched back corners): it can face either way
    rotations: 4
  },
  {
    ...base,
    id: 'floor-half',
    name: 'Half floor',
    kind: 'floor',
    category: 'toit',
    // footprint = the whole 5 × 5 room; the board covers its front half (the back half: rotate it)
    length: 5,
    depth: 5,
    h: 1,
    paint: 'green',
    rotations: 4
  },
  // the same two floors, painted black like the crenel log (medieval)
  {
    ...base,
    id: 'floor-dark',
    shape: 'floor',
    name: 'Dark floor',
    kind: 'floor',
    category: 'toit',
    length: 5,
    depth: 2,
    h: 1,
    paint: 'black',
    rotations: 4
  },
  {
    ...base,
    id: 'floor-half-dark',
    shape: 'floor-half',
    name: 'Dark half floor',
    kind: 'floor',
    category: 'toit',
    length: 5,
    depth: 5,
    h: 1,
    paint: 'black',
    rotations: 4
  },
  { ...base, id: 'tree', name: 'Fir tree', kind: 'decor', category: 'deco', h: 16, paint: 'green', rotations: 4 },
  { ...base, id: 'figurine', name: 'Little character', kind: 'decor', category: 'deco', h: 10, paint: 'red', rotations: 4 },
  // castle decor: a pennant on a pole planted in a round yellow foot, and a knight with his wooden sword
  { ...base, id: 'flag', name: 'Flag', kind: 'decor', category: 'deco', h: 29, paint: 'purple', rotations: 4 },
  { ...base, id: 'knight', name: 'Knight', kind: 'decor', category: 'deco', h: 11, paint: 'grey', rotations: 4 },
  // second knight: crown, auburn hair, red collar, a battle axe
  { ...base, id: 'knight-crown', name: 'Crowned knight', kind: 'decor', category: 'deco', h: 12, paint: 'grey', rotations: 4 }
];

const BY_ID = new Map(CATALOG.map((d) => [d.id, d]));

export function getDef(id: string): PieceDef {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`Unknown piece: ${id}`);
  return d;
}

/** Id of the piece whose shape this one has (itself, or the piece it is a stained copy of). */
export function shapeOf(id: string): string {
  return getDef(id).shape ?? id;
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
