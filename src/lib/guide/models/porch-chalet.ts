import type { PieceSpec } from '../../build/grid';
import { wallSteps } from './build';
import { roofSteps, type Model, type Wall } from './helpers';

/**
 * Chalet with a porch: the sides are long logs, but there is no front wall. The house
 * starts at the middle notch (at 3); in front of it, a covered porch where the front
 * gable rests only on the heads of the long logs.
 */
const W = 5;
const L = 8;
const MID = 3;

const walls: Wall[] = [
  {
    axis: 'x',
    ix: 0,
    iz: MID,
    length: W,
    openings: [{ type: 'door', at: 1, y: 0, side: -1 }]
  },
  {
    axis: 'x',
    ix: 0,
    iz: L,
    length: W,
    openings: [{ type: 'window', at: 1, y: 8, side: 1 }]
  },
  { axis: 'z', ix: 0, iz: 0, length: L, longSide: 1 },
  { axis: 'z', ix: W, iz: 0, length: L, longSide: 1 }
];

/** 8 courses on the front/back. */
const XTOP = 32;

const gables: PieceSpec[] = [
  { type: 'gable', ix: 0, iz: 0, y: XTOP, axis: 'x' },
  { type: 'gable', ix: 0, iz: L, y: XTOP, axis: 'x' }
];

export const porchChalet: Model = {
  id: 'porch-chalet',
  name: 'The porch chalet',
  description: 'A chalet of long logs with no front wall: the roof covers a porch in front of the door.',
  level: 2,
  center: [1.5, 1.8, 2.4],
  steps: [
    ...wallSteps({
      walls,
      xTop: XTOP,
      firstHint: 'No front wall here: the door wall goes 3 steps back, the back wall at the end.'
    }),
    ...roofSteps(gables, {
      gablesHint: 'The front gable rests only on the ends of the long logs: it covers the porch.',
      beamsHint: 'This roof is long: take the long orange beams.',
      ridgeHint: 'Two long ridge caps, end to end, close the top of the roof.',
      chimney: 6,
      chimneyHint: 'Above the room, at the back.'
    }),
    {
      title: 'The finishing touches',
      pieces: [
        { type: 'figurine', ix: 2, iz: 1, y: 0, axis: 'x', side: -1 },
        { type: 'tree', ix: -4, iz: 4, y: 0, axis: 'z' },
        { type: 'tree', ix: 9, iz: 2, y: 0, axis: 'x' },
        { type: 'tree', ix: 9, iz: 7, y: 0, axis: 'z' }
      ],
      hint: 'Someone enjoys the fresh air under the porch.'
    }
  ]
};
