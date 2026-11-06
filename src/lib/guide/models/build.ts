import type { PieceSpec } from '../../build/grid';
import { getDef } from '../../pieces/catalog';
import { openingSpec, wallCourse, type Step, type Wall } from './helpers';

export interface ChaletPlan {
  walls: Wall[];
  /** Top height of the X walls (in Q): X courses go from 0 to xTop-4. */
  xTop: number;
}

/**
 * Generates the steps for the log walls of a rectangular chalet:
 * the X walls go on the table, the Z walls cross them half a log higher,
 * then courses alternate every 2 Q. Doors/windows are inserted right after
 * the course they start on.
 */
export function wallSteps(plan: ChaletPlan, firstCourse = 1): Step[] {
  const steps: Step[] = [];
  const xWalls = plan.walls.filter((w) => w.axis === 'x');
  const zWalls = plan.walls.filter((w) => w.axis === 'z');
  const pendingOpenings = plan.walls.flatMap((w) => (w.openings ?? []).map((o) => ({ w, o })));

  let course = firstCourse;
  const push = (title: string, pieces: PieceSpec[], hint?: string) => {
    if (pieces.length) steps.push({ title, pieces, hint });
  };

  const flushOpenings = (axis: 'x' | 'z', y: number) => {
    const ready = pendingOpenings.filter((p) => p.w.axis === axis && p.o.y <= y);
    for (const r of ready) pendingOpenings.splice(pendingOpenings.indexOf(r), 1);
    const doors = ready.filter((r) => r.o.type === 'door');
    const windows = ready.filter((r) => r.o.type === 'window');
    if (doors.length)
      push(
        doors.length > 1 ? 'The doors' : 'The door',
        doors.map((r) => openingSpec(r.w, r.o)),
        'The frame slides between the heads of the two small logs.'
      );
    if (windows.length)
      push(
        windows.length > 1 ? 'The windows' : 'The window',
        windows.map((r) => openingSpec(r.w, r.o)),
        'The shutters face the outside of the chalet.'
      );
  };

  // Course 1: front and back on the table. The sides cross them in the notches
  // and therefore sit half a log higher (no half-log in the kit: the gap stays visible).
  push(
    `Course ${course++} — front and back`,
    xWalls.flatMap((w) => wallCourse(w, 0)),
    'Front and back first, directly on the table.'
  );
  flushOpenings('x', 0);

  for (let y = 4; y < plan.xTop; y += 4) {
    const zy = y - 2;
    push(
      `Course ${course} — sides`,
      zWalls.flatMap((w) => wallCourse(w, zy)),
      zy === 2 ? 'The notches fit into each other at the corners: the logs lock together.' : undefined
    );
    flushOpenings('z', zy);
    push(`Course ${course++} — front and back`, xWalls.flatMap((w) => wallCourse(w, y)));
    flushOpenings('x', y);
  }
  const lastZ = plan.xTop - 2;
  push(`Course ${course} — sides`, zWalls.flatMap((w) => wallCourse(w, lastZ)), 'The walls are finished!');
  return steps;
}

export function countPieces(steps: Step[]) {
  const counts = new Map<string, number>();
  for (const s of steps) for (const p of s.pieces) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  return counts;
}

export function assertKnown(steps: Step[]) {
  for (const s of steps) for (const p of s.pieces) getDef(p.type);
}
