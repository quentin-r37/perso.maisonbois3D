import type { PieceSpec } from '../../build/grid';
import { wallSteps } from './build';
import { roofSteps, type Model, type Wall } from './helpers';

/** Barn: a long, low building of long logs, with a door at each end to drive straight through. */
const W = 5;
const L = 8;

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
    iz: L,
    length: W,
    openings: [{ type: 'door', at: 1, y: 0, side: 1 }]
  },
  { axis: 'z', ix: 0, iz: 0, length: L, longSide: 1 },
  { axis: 'z', ix: W, iz: 0, length: L, longSide: 1 }
];

/** 7 courses on the front/back: a full log closes the top of the doors. */
const XTOP = 28;

const gables: PieceSpec[] = [
  { type: 'gable', ix: 0, iz: 0, y: XTOP, axis: 'x' },
  { type: 'gable', ix: 0, iz: L, y: XTOP, axis: 'x' }
];

export const barn: Model = {
  id: 'barn',
  name: 'The barn',
  description: 'A long, low barn of long logs, with a door at each end and a long roof.',
  level: 1,
  center: [1.5, 1.6, 2.4],
  steps: [
    ...wallSteps({ walls, xTop: XTOP }),
    ...roofSteps(gables, {
      beamsHint: 'This roof is long: take the long orange beams.',
      ridgeHint: 'Two long ridge caps, end to end, close the top of the roof.'
    }),
    {
      title: 'The finishing touches',
      pieces: [
        { type: 'tree', ix: -4, iz: 2, y: 0, axis: 'x' },
        { type: 'tree', ix: 9, iz: 6, y: 0, axis: 'z' },
        { type: 'figurine', ix: 2, iz: -3, y: 0, axis: 'x', side: -1 }
      ],
      hint: 'A fir tree on each side, and the farmer.'
    }
  ]
};
