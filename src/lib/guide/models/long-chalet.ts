import type { PieceSpec } from '../../build/grid';
import { wallSteps } from './build';
import { battenPieces, chimneyPiece, ridgePieces, roofPieces, type Model, type Wall } from './helpers';

/**
 * Long chalet with two rooms: the sides are long logs (8 G). Their off-center middle
 * notch (at 3) holds an inner wall, which splits the chalet into a small entrance
 * and a large room at the back.
 */
const W = 5;
const L = 8;
/** Inner wall: on the middle notch of the long logs. */
const MID = 3;

const walls: Wall[] = [
  { axis: 'x', ix: 0, iz: 0, length: W, openings: [{ type: 'door', at: 1, y: 0, side: -1 }] },
  { axis: 'x', ix: 0, iz: MID, length: W, openings: [{ type: 'door', at: 1, y: 0, side: -1 }] },
  { axis: 'x', ix: 0, iz: L, length: W, openings: [{ type: 'window', at: 1, y: 8, side: 1 }] },
  { axis: 'z', ix: 0, iz: 0, length: L, longSide: 1 },
  { axis: 'z', ix: W, iz: 0, length: L, longSide: 1 }
];

/** 8 courses on the front/back. */
const XTOP = 32;

const gables: PieceSpec[] = [
  { type: 'gable', ix: 0, iz: 0, y: XTOP, axis: 'x' },
  { type: 'gable', ix: 0, iz: L, y: XTOP, axis: 'x' }
];

export const longChalet: Model = {
  id: 'long-chalet',
  name: 'The long chalet',
  description: 'A bigger chalet built with long logs, with an entrance and a large room, and a long roof.',
  level: 3,
  center: [1.5, 1.8, 2.4],
  steps: [
    ...wallSteps({ walls, xTop: XTOP }),
    {
      title: 'The gables',
      pieces: gables,
      hint: 'The gables go on the front and back walls, not on the inner wall.'
    },
    {
      title: 'The roof beams — left',
      pieces: battenPieces(gables, -1),
      hint: 'This roof is long: take the long orange beams.'
    },
    { title: 'The roof beams — right', pieces: battenPieces(gables, 1) },
    {
      title: 'Roof — left slope',
      pieces: roofPieces(gables, -1),
      hint: 'Lay the green planks on the beams, side by side.'
    },
    { title: 'Roof — right slope', pieces: roofPieces(gables, 1) },
    {
      title: 'The ridge caps',
      pieces: ridgePieces(gables),
      hint: 'Two long ridge caps, end to end, close the top of the roof.'
    },
    { title: 'The chimney', pieces: [chimneyPiece(gables, 5)], hint: 'Above the large room, astride the ridge.' },
    {
      title: 'The finishing touches',
      pieces: [
        { type: 'tree', ix: -4, iz: 2, y: 0, axis: 'x' },
        { type: 'tree', ix: -3, iz: 7, y: 0, axis: 'z' },
        { type: 'tree', ix: 9, iz: 5, y: 0, axis: 'x' },
        { type: 'figurine', ix: 2, iz: -3, y: 0, axis: 'x', side: -1 },
        { type: 'figurine', ix: 4, iz: -3, y: 0, axis: 'x', side: -1 }
      ],
      hint: 'A small forest around it, and the whole family.'
    }
  ]
};
