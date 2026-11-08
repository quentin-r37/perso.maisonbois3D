import type { PieceSpec } from '../../build/grid';
import { wallSteps } from './build';
import { roofSteps, type Model, type Wall } from './helpers';

/**
 * Sheepfold: the same long logs as the long chalet, turned around, so their
 * off-center middle notch is at 5. The inner wall there splits a large room for
 * the sheep (front) from a small hay room (back).
 */
const W = 5;
const L = 8;
const MID = 5;

const walls: Wall[] = [
  {
    axis: 'x',
    ix: 0,
    iz: 0,
    length: W,
    openings: [{ type: 'door', at: 1, y: 0, side: -1 }]
  },
  {
    axis: 'x',
    ix: 0,
    iz: MID,
    length: W,
    openings: [{ type: 'door', at: 1, y: 0, side: 1 }]
  },
  {
    axis: 'x',
    ix: 0,
    iz: L,
    length: W,
    openings: [{ type: 'window', at: 1, y: 8, side: 1 }]
  },
  { axis: 'z', ix: 0, iz: 0, length: L, longSide: -1 },
  { axis: 'z', ix: W, iz: 0, length: L, longSide: -1 }
];

/** 7 courses on the front/back: low, like a farm building (just above the doors). */
const XTOP = 28;

const gables: PieceSpec[] = [
  { type: 'gable', ix: 0, iz: 0, y: XTOP, axis: 'x' },
  { type: 'gable', ix: 0, iz: L, y: XTOP, axis: 'x' }
];

export const sheepfold: Model = {
  id: 'sheepfold',
  name: 'The sheepfold',
  description: 'Long logs turned the other way round: a large room for the sheep and a small hay room at the back.',
  level: 3,
  center: [1.5, 1.6, 2.4],
  steps: [
    ...wallSteps({
      walls,
      xTop: XTOP,
      firstHint: 'Front, inner and back walls on the table. The inner wall is 5 steps back this time.'
    }),
    ...roofSteps(gables, {
      gablesHint: 'The gables go on the front and back walls, not on the inner wall.',
      beamsHint: 'This roof is long: take the long orange beams.',
      ridgeHint: 'Two long ridge caps, end to end, close the top of the roof.'
    }),
    {
      title: 'The finishing touches',
      pieces: [
        { type: 'tree', ix: -4, iz: 1, y: 0, axis: 'x' },
        { type: 'tree', ix: -4, iz: 6, y: 0, axis: 'z' },
        { type: 'tree', ix: 9, iz: 4, y: 0, axis: 'x' },
        { type: 'figurine', ix: 3, iz: -3, y: 0, axis: 'x', side: -1 }
      ],
      hint: 'Fir trees around the meadow, and the shepherd.'
    }
  ]
};
