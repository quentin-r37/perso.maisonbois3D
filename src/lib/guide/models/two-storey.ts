import type { PieceSpec } from '../../build/grid';
import { wallSteps } from './build';
import { roofSteps, type Model, type Wall } from './helpers';

/**
 * Two-storey chalet: a square of medium logs. Between the storeys, two half floors
 * rest on the side walls; that course is only small logs at the corners.
 */
const S = 5;

const walls: Wall[] = [
  {
    axis: 'x',
    ix: 0,
    iz: 0,
    length: S,
    openings: [
      { type: 'door', at: 1, y: 0, side: -1 },
      { type: 'window', at: 1, y: 28, side: -1 }
    ]
  },
  {
    axis: 'x',
    ix: 0,
    iz: S,
    length: S,
    openings: [
      { type: 'window', at: 1, y: 8, side: 1 },
      { type: 'window', at: 1, y: 28, side: 1 }
    ]
  },
  { axis: 'z', ix: 0, iz: 0, length: S },
  {
    axis: 'z',
    ix: S,
    iz: 0,
    length: S,
    openings: [{ type: 'window', at: 1, y: 6, side: -1 }]
  }
];

/** The floor goes on the side walls, above their 7th course (over the door). */
const FLOOR_Y = 26;
/** 12 courses on the front/back. */
const XTOP = 48;

const floor: PieceSpec[] = [
  { type: 'floor-half', ix: 0, iz: 0, y: FLOOR_Y, axis: 'x' },
  { type: 'floor-half', ix: 0, iz: 0, y: FLOOR_Y, axis: 'x', side: -1 }
];

const gables: PieceSpec[] = [
  { type: 'gable', ix: 0, iz: 0, y: XTOP, axis: 'x' },
  { type: 'gable', ix: 0, iz: S, y: XTOP, axis: 'x' }
];

export const twoStorey: Model = {
  id: 'two-storey',
  name: 'The two-storey chalet',
  description: 'A tall chalet of medium logs: a floor between the two storeys, and windows upstairs.',
  level: 3,
  center: [1.5, 2.8, 1.4],
  steps: [
    ...wallSteps({ walls, xTop: XTOP, floor: { y: FLOOR_Y, pieces: floor } }),
    ...roofSteps(gables, { chimney: 4 }),
    {
      title: 'The finishing touches',
      pieces: [
        { type: 'tree', ix: -4, iz: 2, y: 0, axis: 'z' },
        { type: 'tree', ix: 9, iz: 4, y: 0, axis: 'x' },
        { type: 'figurine', ix: 2, iz: -3, y: 0, axis: 'x', side: -1 }
      ],
      hint: 'Two fir trees, and the owner in front of the door.'
    }
  ]
};
