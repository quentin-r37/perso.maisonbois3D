import type { PieceSpec } from '../../build/grid';
import { wallSteps } from './build';
import { prefixSteps, roofSteps, type Model, type Wall } from './helpers';

/** Hamlet: a chalet and a small hut side by side, with a little fence in front. */
const S = 5;
/** The hut starts 4 steps to the right of the chalet. */
const HX = S + 4;

const chaletWalls: Wall[] = [
  {
    axis: 'x',
    ix: 0,
    iz: 0,
    length: S,
    openings: [{ type: 'door', at: 1, y: 0, side: -1 }]
  },
  {
    axis: 'x',
    ix: 0,
    iz: S,
    length: S,
    openings: [{ type: 'window', at: 1, y: 8, side: 1 }]
  },
  {
    axis: 'z',
    ix: 0,
    iz: 0,
    length: S,
    openings: [{ type: 'window', at: 1, y: 10, side: 1 }]
  },
  { axis: 'z', ix: S, iz: 0, length: S }
];
const CHALET_TOP = 28;

const hutWalls: Wall[] = [
  {
    axis: 'x',
    ix: HX,
    iz: 0,
    length: S,
    openings: [{ type: 'door', at: 1, y: 0, side: -1 }]
  },
  { axis: 'x', ix: HX, iz: S, length: S },
  { axis: 'z', ix: HX, iz: 0, length: S },
  {
    axis: 'z',
    ix: HX + S,
    iz: 0,
    length: S,
    openings: [{ type: 'window', at: 1, y: 6, side: -1 }]
  }
];
const HUT_TOP = 24;

const gablesAt = (ix: number, y: number): PieceSpec[] => [
  { type: 'gable', ix, iz: 0, y, axis: 'x' },
  { type: 'gable', ix, iz: S, y, axis: 'x' }
];
const chaletGables = gablesAt(0, CHALET_TOP);
const hutGables = gablesAt(HX, HUT_TOP);

/** Fence in front of each building, with a gap between them: posts (small logs) and medium rails. */
const FZ = -4;
const fencePosts = (y: number): PieceSpec[] =>
  [0, S, HX, HX + S].map((ix) => ({
    type: 'small',
    ix,
    iz: FZ,
    y,
    axis: 'z' as const
  }));
const fenceRails = (y: number): PieceSpec[] => [
  { type: 'medium', ix: 0, iz: FZ, y, axis: 'x' },
  { type: 'medium', ix: HX, iz: FZ, y, axis: 'x' }
];

export const hamlet: Model = {
  id: 'hamlet',
  name: 'The hamlet',
  description: 'Two buildings side by side: a chalet with its chimney, a small hut, and a fence in front.',
  level: 3,
  center: [4.2, 1.6, 1.4],
  steps: [
    ...prefixSteps('Chalet', wallSteps({ walls: chaletWalls, xTop: CHALET_TOP })),
    ...prefixSteps('Chalet', roofSteps(chaletGables, { chimney: 4 })),
    ...prefixSteps(
      'Hut',
      wallSteps({
        walls: hutWalls,
        xTop: HUT_TOP,
        firstHint: 'The hut goes 4 steps to the right of the chalet. Front and back on the table.'
      })
    ),
    ...prefixSteps('Hut', roofSteps(hutGables)),
    {
      title: 'The fence — posts',
      pieces: fencePosts(0),
      hint: 'In front of the two buildings: small logs as posts.'
    },
    { title: 'The fence — rails', pieces: fenceRails(2) },
    { title: 'The fence — posts (2)', pieces: fencePosts(4) },
    { title: 'The fence — rails (2)', pieces: fenceRails(6) },
    {
      title: 'The finishing touches',
      pieces: [
        { type: 'tree', ix: -4, iz: 3, y: 0, axis: 'x' },
        { type: 'tree', ix: 7, iz: 4, y: 0, axis: 'z' },
        { type: 'tree', ix: 18, iz: 2, y: 0, axis: 'x' },
        { type: 'figurine', ix: 2, iz: -2, y: 0, axis: 'x', side: -1 },
        { type: 'figurine', ix: 7, iz: -4, y: 0, axis: 'x', side: -1 }
      ],
      hint: 'Fir trees all around, and the neighbours say hello.'
    }
  ]
};
