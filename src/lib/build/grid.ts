/**
 * Grid and unit conventions.
 *
 * - Grid points (ix, iz) are integers, G world units apart. The kit's pieces
 *   all fall on this grid: medium log = 5 G between its notches, long log = 3 G + 5 G
 *   (middle notch off-center), small = a single notch.
 * - Heights are counted in "quarters" (Q): a log is 4 Q tall, a notch is 1 Q deep.
 *   Two crossing logs fit into each other by 2 Q (1 Q notch on top + 1 Q underneath),
 *   which gives the half-log offset between walls running along X and along Z.
 */
export const G = 0.6;
/** Log thickness: square section (= length of a notch, since the crossing log slides into it). */
export const LOG_W = 0.4;
export const Q = 0.1;
export const LOG_H = 4 * Q;
/** Distance from the center of the end notch to the tip of the head. */
export const OVERHANG = 0.55;

export const GRID_MIN = -16;
export const GRID_MAX = 22;
export const MAX_Y = 200;

export type Axis = 'x' | 'z';
export type Side = 1 | -1;

/** Description of a piece (type + position). Identical format for the sandbox and the guided models. */
export interface PieceSpec {
  type: string;
  ix: number;
  iz: number;
  /** Height of the base, in quarters. */
  y: number;
  axis: Axis;
  /** Facing (long log, doors/windows/decor) or slope (roof). */
  side?: Side;
  /** Position on the roof (plate, beam, ridge cap/chimney in half-plates). */
  slot?: number;
  /** Roof: gable width (in G). */
  param?: number;
  /** Roof: distance between the gables (in G). */
  param2?: number;
}

export interface PlacedPiece extends PieceSpec {
  uid: number;
}

export const pkey = (ix: number, iz: number) => `${ix},${iz}`;

/** Direction along the axis. */
export function alongDir(axis: Axis): [number, number] {
  return axis === 'x' ? [1, 0] : [0, 1];
}

/**
 * Perpendicular direction consistent with the mesh rotation:
 * a mesh on axis z is rotated -90° around Y, so its local +z points toward world -x.
 */
export function perpDir(axis: Axis): [number, number] {
  return axis === 'x' ? [0, 1] : [-1, 0];
}

export function axisSideToRot(axis: Axis, side: Side = 1): number {
  return (axis === 'x' ? 0 : 1) + (side === -1 ? 2 : 0);
}
