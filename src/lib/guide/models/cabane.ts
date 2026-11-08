import type { PieceSpec } from '../../build/grid';
import { wallSteps } from './build';
import { battenPieces, ridgePieces, roofPieces, type Model, type Wall } from './helpers';

/** Small square hut: medium logs, a door and a side window, one course lower than the chalet. */
const S = 5;

const walls: Wall[] = [
  { axis: 'x', ix: 0, iz: 0, length: S, openings: [{ type: 'door', at: 1, y: 0, side: -1 }] },
  { axis: 'x', ix: 0, iz: S, length: S },
  { axis: 'z', ix: 0, iz: 0, length: S },
  { axis: 'z', ix: S, iz: 0, length: S, openings: [{ type: 'window', at: 1, y: 6, side: -1 }] }
];

/** 7 courses on the front/back: a full log closes the top of the door. */
const XTOP = 28;

const gables: PieceSpec[] = [
  { type: 'gable', ix: 0, iz: 0, y: XTOP, axis: 'x' },
  { type: 'gable', ix: 0, iz: S, y: XTOP, axis: 'x' }
];

export const cabane: Model = {
  id: 'cabane',
  name: "The woodcutter's hut",
  description: 'A small, quick hut to start with: a door, a window and a gable roof.',
  level: 1,
  center: [1.5, 1.6, 1.4],
  steps: [
    ...wallSteps({ walls, xTop: XTOP }),
    {
      title: 'The gables',
      pieces: gables,
      hint: 'The two yellow gables sit on top of the front and back walls.'
    },
    {
      title: 'The roof beams — left',
      pieces: battenPieces(gables, -1),
      hint: 'The orange beams slide into the slanted notches of the gables.'
    },
    { title: 'The roof beams — right', pieces: battenPieces(gables, 1) },
    {
      title: 'Roof — left slope',
      pieces: roofPieces(gables, -1),
      hint: 'Lay the green planks on the beams, side by side.'
    },
    { title: 'Roof — right slope', pieces: roofPieces(gables, 1) },
    { title: 'The ridge caps', pieces: ridgePieces(gables), hint: 'They close the top of the roof.' },
    {
      title: 'The finishing touches',
      pieces: [
        { type: 'tree', ix: -3, iz: 1, y: 0, axis: 'x' },
        { type: 'figurine', ix: 2, iz: -3, y: 0, axis: 'x', side: -1 }
      ],
      hint: 'A fir tree and the woodcutter!'
    }
  ]
};
