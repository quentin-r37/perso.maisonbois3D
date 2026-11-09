import { SvelteMap } from 'svelte/reactivity';
import { onSubGrid, type PieceSpec, type PlacedPiece } from './grid';
import { buildIndex, normalize, specKey } from './snap';
import { findRoofs } from './roof';
import { hasDef } from '../pieces/catalog';

type Action = { kind: 'add' | 'remove'; pieces: PlacedPiece[] };

function readStorage(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private browsing / quota: ignore */
  }
}

export function sanitizeSpecs(data: unknown): PieceSpec[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter(
      (p): p is PieceSpec =>
        p &&
        typeof p === 'object' &&
        typeof p.type === 'string' &&
        hasDef(p.type) &&
        onSubGrid(p.ix) &&
        onSubGrid(p.iz) &&
        Number.isInteger(p.y) &&
        (p.axis === 'x' || p.axis === 'z')
    )
    .map(normalize);
}

/**
 * Shared by every build: the scene keys the piece components by uid, and switching between
 * the sandbox and the booklet must not hand the component of one piece to another one.
 */
let nextUid = 1;

/** A build: list of placed pieces + undo/redo history. */
export class BuildStore {
  pieces = $state.raw<PlacedPiece[]>([]);
  #undo = $state.raw<Action[]>([]);
  #redo = $state.raw<Action[]>([]);

  index = $derived(buildIndex(this.pieces));
  roofs = $derived(findRoofs(this.pieces));
  keys = $derived(new Set(this.pieces.map(specKey)));

  canUndo = $derived(this.#undo.length > 0);
  canRedo = $derived(this.#redo.length > 0);

  /** Doors / shutters the player opened (true) or closed (false); absent: as modeled. Not saved. */
  doors = new SvelteMap<number, boolean>();

  /** Pieces that should play the drop animation when they appear. */
  fresh = new Set<number>();
  readonly storageKey: string | null;

  constructor(storageKey: string | null = null) {
    this.storageKey = storageKey;
    if (storageKey) {
      const specs = sanitizeSpecs(readStorage(storageKey));
      this.pieces = specs.map((s) => ({ ...s, uid: nextUid++ }));
    }
  }

  save() {
    if (this.storageKey) writeStorage(this.storageKey, this.toSpecs());
  }

  toSpecs(): PieceSpec[] {
    return this.pieces.map(({ uid: _uid, ...spec }) => normalize(spec));
  }

  #apply(action: Action, inverse: boolean, animate: boolean) {
    const adding = (action.kind === 'add') !== inverse;
    if (adding) {
      if (animate) for (const p of action.pieces) this.fresh.add(p.uid);
      this.pieces = [...this.pieces, ...action.pieces];
    } else {
      const uids = new Set(action.pieces.map((p) => p.uid));
      this.pieces = this.pieces.filter((p) => !uids.has(p.uid));
    }
  }

  #record(action: Action) {
    this.#undo = [...this.#undo.slice(-199), action];
    this.#redo = [];
  }

  add(spec: PieceSpec, animate = true): PlacedPiece {
    const piece: PlacedPiece = { ...normalize(spec), uid: nextUid++ };
    const action: Action = { kind: 'add', pieces: [piece] };
    this.#apply(action, false, animate);
    this.#record(action);
    return piece;
  }

  remove(uid: number) {
    const piece = this.pieces.find((p) => p.uid === uid);
    if (!piece) return;
    const action: Action = { kind: 'remove', pieces: [piece] };
    this.#apply(action, false, false);
    this.#record(action);
  }

  clear() {
    if (!this.pieces.length) return;
    const action: Action = { kind: 'remove', pieces: [...this.pieces] };
    this.#apply(action, false, false);
    this.#record(action);
  }

  load(specs: PieceSpec[], animate = false) {
    this.doors.clear();
    this.#undo = [];
    this.#redo = [];
    this.fresh.clear();
    this.pieces = specs.map((s) => {
      const p = { ...normalize(s), uid: nextUid++ };
      if (animate) this.fresh.add(p.uid);
      return p;
    });
  }

  undo() {
    const action = this.#undo.at(-1);
    if (!action) return;
    this.#undo = this.#undo.slice(0, -1);
    this.#apply(action, true, false);
    this.#redo = [...this.#redo, action];
  }

  redo() {
    const action = this.#redo.at(-1);
    if (!action) return;
    this.#redo = this.#redo.slice(0, -1);
    this.#apply(action, false, true);
    this.#undo = [...this.#undo, action];
  }

  /** Called by the Piece component: true only once per new piece. */
  consumeFresh(uid: number): boolean {
    const f = this.fresh.has(uid);
    this.fresh.delete(uid);
    return f;
  }
}
