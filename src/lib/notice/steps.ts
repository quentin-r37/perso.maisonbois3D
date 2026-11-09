import type { PieceSpec } from '../build/grid';
import { roofOfPiece } from '../build/roof';
import { addToIndex, buildIndex, validate } from '../build/snap';
import type { Step } from '../guide/models/helpers';
import { getDef, type Kind } from '../pieces/catalog';

/** Most pieces shown in a single step. */
export const MAX_STEP = 8;

interface Group {
  title: string;
  /** Sort key: phase (structure, roof, decor), then position inside the phase. */
  order: number[];
  pieces: PieceSpec[];
}

const STRUCT_RANK: Partial<Record<Kind, number>> = { log: 0, insert: 1, floor: 2, gable: 3 };
const ROOF_RANK: Partial<Record<Kind, number>> = { batten: 0, roof: 1, ridge: 2, chimney: 3 };
const TITLES: Record<Kind, string> = {
  log: 'Logs',
  insert: 'Doors and windows',
  floor: 'Floor',
  gable: 'Gables',
  batten: 'Roof beams',
  roof: 'Roof planks',
  ridge: 'Ridge caps',
  chimney: 'Chimney',
  decor: 'Decorations'
};

const cmp = (a: number[], b: number[]) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
};

const byPlace = (a: PieceSpec, b: PieceSpec) =>
  a.y - b.y || a.ix - b.ix || a.iz - b.iz || (a.side ?? 1) - (b.side ?? 1) || (a.slot ?? 0) - (b.slot ?? 0);

/** Sorts the pieces into groups in the order of the booklet: rows from the ground up, roofs, decorations. */
function groupsOf(pieces: readonly PieceSpec[]): Group[] {
  const logLevels = [...new Set(pieces.filter((p) => getDef(p.type).kind === 'log').map((p) => p.y))].sort((a, b) => a - b);
  const roofKeys = [...new Set(pieces.filter((p) => getDef(p.type).kind in ROOF_RANK).map(roofOfPiece))].sort();
  const groups = new Map<string, Group>();
  for (const p of pieces) {
    const kind = getDef(p.type).kind;
    let title: string;
    let order: number[];
    if (kind === 'log') {
      title = `Row ${logLevels.indexOf(p.y) + 1}: logs`;
      order = [0, p.y, 0];
    } else if (kind in STRUCT_RANK) {
      title = TITLES[kind];
      order = [0, p.y, STRUCT_RANK[kind]!];
    } else if (kind in ROOF_RANK) {
      title = TITLES[kind];
      // planks: one slope at a time (each slope needs its own beams)
      order = [1, roofKeys.indexOf(roofOfPiece(p)), ROOF_RANK[kind]!, kind === 'roof' ? (p.side ?? 1) : 0];
    } else {
      title = TITLES.decor;
      order = [2];
    }
    const key = order.join(':');
    const g = groups.get(key);
    if (g) g.pieces.push(p);
    else groups.set(key, { title, order, pieces: [p] });
  }
  const list = [...groups.values()].sort((a, b) => cmp(a.order, b.order));
  for (const g of list) g.pieces.sort(byPlace);
  return list;
}

/**
 * Cuts a free build into building steps. The pieces are replayed with the rules of the
 * game: a piece only enters a step once everything it rests on has been placed, so the
 * booklet can always be followed, whatever the order the build was made in.
 */
export function generateSteps(pieces: readonly PieceSpec[]): Step[] {
  const groups = groupsOf(pieces);
  const placed: PieceSpec[] = [];
  const index = buildIndex([]);
  const steps: Step[] = [];

  const emit = (title: string, list: PieceSpec[]) => {
    const parts = Math.ceil(list.length / MAX_STEP);
    const size = Math.ceil(list.length / parts);
    for (let k = 0; k < parts; k++)
      steps.push({ title: parts > 1 ? `${title} (${k + 1}/${parts})` : title, pieces: list.slice(k * size, (k + 1) * size) });
  };

  while (groups.some((g) => g.pieces.length)) {
    let progressed = false;
    for (const g of groups) {
      if (!g.pieces.length) continue;
      const ready: PieceSpec[] = [];
      const later: PieceSpec[] = [];
      for (const p of g.pieces) {
        if (validate(p, placed, index).ok) {
          ready.push(p);
          placed.push(p);
          addToIndex(index, p);
        } else later.push(p);
      }
      if (!ready.length) continue;
      g.pieces = later;
      emit(g.title, ready);
      progressed = true;
      // back to the lowest group: what was just placed may have unlocked it
      break;
    }
    if (!progressed) {
      // pieces the rules can't place (a roof without its gables…): shown anyway, last
      for (const g of groups) {
        if (g.pieces.length) emit(g.title, g.pieces);
        g.pieces = [];
      }
    }
  }
  return steps;
}
