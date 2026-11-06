import type { PieceSpec } from '../../build/grid';
import { wallSteps } from './build';
import { battenPieces, chimneyPiece, ridgePieces, roofPieces, type Model, type Wall } from './helpers';

/** Square chalet: 4 walls of medium logs (5 G). */
const S = 5;

const walls: Wall[] = [
  { axis: 'x', ix: 0, iz: 0, length: S, openings: [{ type: 'door', at: 1, y: 0, side: -1 }] },
  { axis: 'x', ix: 0, iz: S, length: S, openings: [{ type: 'window', at: 1, y: 8, side: 1 }] },
  { axis: 'z', ix: 0, iz: 0, length: S, openings: [{ type: 'window', at: 1, y: 10, side: 1 }] },
  { axis: 'z', ix: S, iz: 0, length: S }
];

/** 7 courses on the front/back. */
const XTOP = 28;

const gables: PieceSpec[] = [
  { type: 'gable', ix: 0, iz: 0, y: XTOP, axis: 'x' },
  { type: 'gable', ix: 0, iz: S, y: XTOP, axis: 'x' }
];

/** Little fence in front: two medium rails held by small logs. */
const FZ = -4;
const fencePosts = (y: number): PieceSpec[] =>
  [-4, 1, 4, 9].map((ix) => ({ type: 'small', ix, iz: FZ, y, axis: 'z' as const }));
const fenceRails = (y: number): PieceSpec[] => [
  { type: 'medium', ix: -4, iz: FZ, y, axis: 'x' },
  { type: 'medium', ix: 4, iz: FZ, y, axis: 'x' }
];

export const petitChalet: Model = {
  id: 'petit-chalet',
  name: 'The little mountain chalet',
  description: 'A square chalet of medium logs, with a door, two windows, a gable roof and its little fence.',
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
    {
      title: 'The ridge caps',
      pieces: ridgePieces(gables),
      hint: 'A long one and a short one, end to end, close the top of the roof.'
    },
    { title: 'The chimney', pieces: [chimneyPiece(gables, 4)], hint: 'The chimney sits astride the ridge.' },
    { title: 'The fence — posts', pieces: fencePosts(0), hint: 'In front of the chalet, a little fence: small logs as posts.' },
    { title: 'The fence — rails', pieces: fenceRails(2) },
    { title: 'The fence — posts (2)', pieces: fencePosts(4) },
    { title: 'The fence — rails (2)', pieces: fenceRails(6) },
    {
      title: 'The finishing touches',
      pieces: [
        { type: 'tree', ix: -4, iz: 3, y: 0, axis: 'x' },
        { type: 'tree', ix: 9, iz: 1, y: 0, axis: 'z' },
        { type: 'figurine', ix: 2, iz: -2, y: 0, axis: 'x', side: -1 }
      ],
      hint: 'A few fir trees and the owner of the chalet!'
    }
  ]
};
