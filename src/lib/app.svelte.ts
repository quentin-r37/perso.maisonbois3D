import { BuildStore, writeStorage } from './build/store.svelte';
import type { PieceSpec } from './build/grid';
import { canRemove, dropHeight, specKey } from './build/snap';
import { candidateFromHit, evaluate, magnet, normRot, rotOf, type Ghost, type Hit } from './build/placement';
import { getModel, MODELS } from './guide/models';
import { getDef, isRoofKind } from './pieces/catalog';
import { bonk, chime, fanfare, pop, setMuted } from './audio/sfx';
import { axisSideToRot } from './build/grid';

export type Mode = 'libre' | 'guide';
export type Tool = 'build' | 'erase';

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

class GuideState {
  modelId = $state(MODELS[0].id);
  readonly build: BuildStore;

  model = $derived(getModel(this.modelId));
  /** Current step = first step that is not complete. */
  stepIndex = $derived.by(() => {
    const keys = this.build.keys;
    const i = this.model.steps.findIndex((s) => s.pieces.some((p) => !keys.has(specKey(p))));
    return i === -1 ? this.model.steps.length : i;
  });
  done = $derived(this.stepIndex >= this.model.steps.length);
  step = $derived(this.model.steps[this.stepIndex] ?? null);
  remaining = $derived(this.step ? this.step.pieces.filter((p) => !this.build.keys.has(specKey(p))) : []);
  /** Remaining pieces of the kit (whole model). */
  inventory = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const s of this.model.steps)
      for (const p of s.pieces)
        if (!this.build.keys.has(specKey(p))) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
    return counts;
  });
  /** Pieces needed for the current step. */
  stepNeeds = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const p of this.remaining) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
    return counts;
  });
  /** Types used by the model (for the palette). */
  modelTypes = $derived([...new Set(this.model.steps.flatMap((s) => s.pieces.map((p) => p.type)))]);
  totalPieces = $derived(this.model.steps.reduce((n, s) => n + s.pieces.length, 0));
  placedCount = $derived(this.totalPieces - [...this.inventory.values()].reduce((a, b) => a + b, 0));

  constructor(build: BuildStore) {
    this.build = build;
    this.modelId = readJSON('chalet.guide.model.v1', MODELS[0].id);
  }
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'warn';
}

class AppState {
  mode = $state<Mode>('libre');
  tool = $state<Tool>('build');
  selected = $state<string | null>('medium');
  rot = $state(0);
  ghost = $state.raw<Ghost | null>(null);
  /** Touch: ghost waiting for confirmation. */
  pending = $state(false);
  hoverUid = $state<number | null>(null);
  muted = $state(false);
  toast = $state.raw<Toast | null>(null);
  celebrating = $state(false);
  helpOpen = $state(false);
  lastHit: Hit | null = null;

  sandbox = new BuildStore('chalet.sandbox.v3');
  guideBuild = new BuildStore('chalet.guide.build.v3');
  guide = new GuideState(this.guideBuild);

  build = $derived(this.mode === 'libre' ? this.sandbox : this.guideBuild);

  #toastId = 0;
  #toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const prefs = readJSON<{ mode?: Mode; muted?: boolean; seenHelp?: boolean }>('chalet.prefs.v1', {});
    this.mode = prefs.mode === 'guide' ? 'guide' : 'libre';
    this.muted = !!prefs.muted;
    this.helpOpen = !prefs.seenHelp;
    setMuted(this.muted);
    if (this.mode === 'guide') this.#autoSelectForStep();
  }

  savePrefs() {
    writeStorage('chalet.prefs.v1', { mode: this.mode, muted: this.muted, seenHelp: true });
    writeStorage('chalet.guide.model.v1', this.guide.modelId);
  }

  notify(text: string, kind: Toast['kind'] = 'info', ms = 2200) {
    clearTimeout(this.#toastTimer);
    this.toast = { id: ++this.#toastId, text, kind };
    this.#toastTimer = setTimeout(() => (this.toast = null), ms);
  }

  setMode(mode: Mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    this.ghost = null;
    this.pending = false;
    this.tool = 'build';
    this.celebrating = false;
    if (mode === 'guide') this.#autoSelectForStep();
    this.savePrefs();
  }

  toggleMute() {
    this.muted = !this.muted;
    setMuted(this.muted);
    this.savePrefs();
  }

  select(type: string | null) {
    this.selected = type;
    this.tool = 'build';
    this.pending = false;
    if (type) this.rot = normRot(type, this.rot);
    this.refreshGhost();
  }

  setTool(tool: Tool) {
    this.tool = tool;
    this.pending = false;
    this.ghost = null;
    this.hoverUid = null;
  }

  rotate(dir = 1) {
    if (!this.selected) return;
    const n = getDef(this.selected).rotations;
    if (n === 1) return;
    this.rot = (((this.rot + dir) % n) + n) % n;
    pop();
    this.refreshGhost();
  }

  // -------------------------------------------------------------------------
  // Placement

  /** Recomputes the ghost from a hit (pointer move or tap). */
  updateFromHit(hit: Hit | null) {
    this.lastHit = hit;
    if (!hit || !this.selected || this.tool !== 'build') {
      this.ghost = null;
      return;
    }
    const build = this.build;
    const view = { pieces: build.pieces, index: build.index, roofs: build.roofs };
    if (this.mode === 'guide') {
      if (this.guide.done) {
        this.ghost = null;
        return;
      }
      const expected = magnet(this.selected, hit, this.guide.remaining);
      if (expected) {
        const ok = dropHeight(build.index, expected) === expected.y;
        const g = evaluate(expected, view);
        this.ghost = ok ? g : { ...g, ok: false, reason: 'Place the pieces underneath first' };
        return;
      }
      const cand = candidateFromHit(this.selected, this.rot, hit, view);
      if (!cand) {
        this.ghost = null;
        return;
      }
      const needed = this.guide.stepNeeds.has(this.selected);
      this.ghost = {
        spec: cand,
        ok: false,
        reason: needed ? 'Follow the blue outlines' : 'This piece is not needed in this step'
      };
      return;
    }
    const cand = candidateFromHit(this.selected, this.rot, hit, view);
    this.ghost = cand ? evaluate(cand, view) : null;
  }

  refreshGhost() {
    this.updateFromHit(this.lastHit);
  }

  /** Places the current ghost. */
  placeGhost(): boolean {
    const g = this.ghost;
    this.pending = false;
    if (!g) return false;
    if (!g.ok) {
      bonk();
      if (g.reason) this.notify(g.reason, 'warn');
      return false;
    }
    this.placeSpec(g.spec);
    this.refreshGhost();
    return true;
  }

  placeSpec(spec: PieceSpec) {
    const before = this.guide.stepIndex;
    const wasGuide = this.mode === 'guide';
    this.build.add(spec);
    this.build.save();
    if (wasGuide) this.#afterGuideChange(before);
  }

  #afterGuideChange(before: number) {
    const after = this.guide.stepIndex;
    if (after > before) {
      if (this.guide.done) {
        setTimeout(() => {
          fanfare();
          this.celebrating = true;
          this.notify('Well done! Your chalet is finished 🎉', 'success', 5000);
        }, 450);
      } else {
        setTimeout(() => chime(), 350);
        this.notify(`Step ${before + 1} done ✓`, 'success', 1600);
        this.#autoSelectForStep();
      }
    } else if (after < before) {
      this.celebrating = false;
      this.#autoSelectForStep();
    }
  }

  /** Guided mode: selects a piece needed for the step. */
  #autoSelectForStep() {
    const rem = this.guide.remaining;
    if (!rem.length) return;
    if (this.selected && rem.some((p) => p.type === this.selected)) return;
    const first = rem[0];
    this.selected = first.type;
    this.rot = axisSideToRot(first.axis, first.side ?? 1) % getDef(first.type).rotations;
    this.tool = 'build';
  }

  /** Removes a piece (if nothing rests on it). */
  erase(uid: number) {
    const build = this.build;
    const piece = build.pieces.find((p) => p.uid === uid);
    if (!piece) return;
    const v = canRemove(piece, build.pieces, build.index);
    if (!v.ok) {
      bonk();
      this.notify(v.reason ?? 'Impossible', 'warn');
      return;
    }
    const before = this.guide.stepIndex;
    build.remove(uid);
    build.save();
    pop();
    this.hoverUid = null;
    if (this.mode === 'guide') this.#afterGuideChange(before);
    this.refreshGhost();
  }

  undo() {
    const before = this.guide.stepIndex;
    this.build.undo();
    this.build.save();
    if (this.mode === 'guide') this.#afterGuideChange(before);
    this.refreshGhost();
  }

  redo() {
    const before = this.guide.stepIndex;
    this.build.redo();
    this.build.save();
    if (this.mode === 'guide') this.#afterGuideChange(before);
    this.refreshGhost();
  }

  clear() {
    this.build.clear();
    this.build.save();
    this.celebrating = false;
    if (this.mode === 'guide') this.#autoSelectForStep();
    this.ghost = null;
  }

  // -------------------------------------------------------------------------
  // Guided mode

  /** "Show me": automatically places the next piece. */
  showMe() {
    if (this.mode !== 'guide') return;
    const next = this.guide.remaining.find((p) => dropHeight(this.build.index, p) === p.y);
    if (!next) return;
    this.selected = next.type;
    this.rot = axisSideToRot(next.axis, next.side ?? 1) % getDef(next.type).rotations;
    this.placeSpec(next);
    this.refreshGhost();
  }

  /** Completes the whole current step. */
  finishStep() {
    if (this.mode !== 'guide') return;
    const pieces = [...this.guide.remaining];
    pieces.forEach((p, i) =>
      setTimeout(() => {
        if (this.mode !== 'guide' || this.build.keys.has(specKey(p))) return;
        this.placeSpec(p);
      }, i * 140)
    );
  }

  setModel(id: string) {
    if (id === this.guide.modelId) return;
    this.guide.modelId = id;
    this.guideBuild.load([]);
    this.guideBuild.save();
    this.celebrating = false;
    this.savePrefs();
    this.#autoSelectForStep();
  }

  restartGuide() {
    this.guideBuild.load([]);
    this.guideBuild.save();
    this.celebrating = false;
    this.#autoSelectForStep();
  }

  // -------------------------------------------------------------------------
  // Import / export

  exportJSON(): string {
    return JSON.stringify({ format: 'chalet-bois/1', pieces: this.build.toSpecs() }, null, 1);
  }

  importJSON(text: string, sanitize: (d: unknown) => PieceSpec[]) {
    try {
      const data = JSON.parse(text);
      const specs = sanitize(Array.isArray(data) ? data : data?.pieces);
      if (!specs.length) throw new Error('empty');
      this.setMode('libre');
      this.sandbox.load(specs, true);
      this.sandbox.save();
      this.notify(`${specs.length} pieces loaded`, 'success');
    } catch {
      this.notify('Invalid file', 'warn');
    }
  }
}

export const app = new AppState();
export { isRoofKind, rotOf };

if (import.meta.env?.DEV && typeof window !== 'undefined') (window as any).__app = app;
