import { BuildStore, sanitizeSpecs, writeStorage } from './build/store.svelte';
import type { PieceSpec, PlacedPiece } from './build/grid';
import { canRemove, dropHeight, specKey } from './build/snap';
import {
  resolveAim,
  candidateFromHit,
  evaluate,
  magnet,
  nearestValid,
  normRot,
  rotOf,
  snapToLock,
  type Ghost,
  type Hit
} from './build/placement';
import { DEFAULT_MODEL_ID, getModel, type Model } from './guide/models';
import { getDef, isRoofKind } from './pieces/catalog';
import { bonk, chime, clack, fanfare, pop, setMuted } from './audio/sfx';
import { axisSideToRot } from './build/grid';
import { loadRapier } from './destroy/rapier';
import { DemoWorld } from './destroy/world';
import { getOpenableGeometry } from './pieces/geometry';
import { isSoftwareRenderer, MAX_QUALITY } from './ui/quality';

export type Mode = 'libre' | 'guide';
export type Tool = 'build' | 'erase' | 'door';
export type DemoEffect = 'explosion' | 'tornado' | 'quake' | 'bomb';

/** One demolition effect to fire (a new object each time, even for the same effect). */
export interface DemoShot {
  id: number;
  effect: DemoEffect;
  /** Bomb: where it goes off. */
  point?: [number, number, number];
}

/**
 * Demolition: purely visual. The pieces are copied, the copies are blown up by the
 * physics engine, then "rebuilt" (rewound) — the build itself is never touched.
 */
class DemolitionState {
  phase = $state<'idle' | 'running' | 'rebuilding'>('idle');
  effect = $state<DemoEffect>('explosion');
  /** Snapshot of the pieces being demolished. */
  pieces = $state.raw<PlacedPiece[]>([]);
  shot = $state.raw<DemoShot | null>(null);
  menuOpen = $state(false);
  active = $derived(this.phase !== 'idle');
}

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

class GuideState {
  modelId = $state(DEFAULT_MODEL_ID);
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
    this.modelId = getModel(readJSON('chalet.guide.model.v1', DEFAULT_MODEL_ID)).id;
  }
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'warn';
}

/** Saved progress of the models that are not open in the booklet. */
const stashKey = (modelId: string) => `chalet.guide.stash.v1.${modelId}`;

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
  /** Frame rate counter in the corner (F). */
  showFps = $state(true);
  /** Rendering quality, index into QUALITY (slider of the frame rate counter). */
  quality = $state(MAX_QUALITY);
  lastHit: Hit | null = null;
  /** Shift held: no magnet toward the notches, the piece goes exactly under the cursor. */
  freePlace = $state(false);

  sandbox = new BuildStore('chalet.sandbox.v3');
  guideBuild = new BuildStore('chalet.guide.build.v3');
  guide = new GuideState(this.guideBuild);

  build = $derived(this.mode === 'libre' ? this.sandbox : this.guideBuild);

  demo = new DemolitionState();
  #shotId = 0;

  #toastId = 0;
  #toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const prefs = readJSON<{ mode?: Mode; muted?: boolean; seenHelp?: boolean; showFps?: boolean; quality?: number }>(
      'chalet.prefs.v1',
      {}
    );
    this.mode = prefs.mode === 'guide' ? 'guide' : 'libre';
    this.muted = !!prefs.muted;
    this.helpOpen = !prefs.seenHelp;
    this.showFps = prefs.showFps ?? true;
    // no saved choice: start low when the GPU isn't there (rendering on the CPU)
    this.quality =
      typeof prefs.quality === 'number'
        ? Math.max(0, Math.min(MAX_QUALITY, Math.round(prefs.quality)))
        : isSoftwareRenderer()
          ? 0
          : MAX_QUALITY;
    setMuted(this.muted);
    if (this.mode === 'guide') this.#autoSelectForStep();
  }

  savePrefs() {
    writeStorage('chalet.prefs.v1', {
      mode: this.mode,
      muted: this.muted,
      seenHelp: true,
      showFps: this.showFps,
      quality: this.quality
    });
    writeStorage('chalet.guide.model.v1', this.guide.modelId);
  }

  notify(text: string, kind: Toast['kind'] = 'info', ms = 2200) {
    clearTimeout(this.#toastTimer);
    this.toast = { id: ++this.#toastId, text, kind };
    this.#toastTimer = setTimeout(() => (this.toast = null), ms);
  }

  setMode(mode: Mode) {
    if (mode === this.mode || this.demo.active) return;
    this.mode = mode;
    this.ghost = null;
    this.pending = false;
    this.tool = 'build';
    this.celebrating = false;
    if (mode === 'guide') this.#autoSelectForStep();
    this.savePrefs();
  }

  toggleFps() {
    this.showFps = !this.showFps;
    this.savePrefs();
  }

  setQuality(level: number) {
    this.quality = Math.max(0, Math.min(MAX_QUALITY, Math.round(level)));
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

  /**
   * Opens a door / the shutters of a window (ajar or closed), or closes them (open).
   * False if the piece has nothing to open.
   */
  toggleDoor(uid: number): boolean {
    const build = this.build;
    const piece = build.pieces.find((p) => p.uid === uid);
    const geo = piece && getOpenableGeometry(piece.type);
    if (!geo) return false;
    // as modeled, the doors are ajar (not open) and the shutters open
    const wasOpen = build.doors.get(uid) ?? geo.leaves.every((l) => l.ajar >= l.open);
    const open = !wasOpen;
    build.doors.set(uid, open);
    clack(open ? 0.35 : 0.7);
    return true;
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
    if (!cand) {
      this.ghost = null;
      return;
    }
    let g = evaluate(cand, view);
    // the spot does not work: slide the ghost to the nearest spot that fits
    if (!g.ok) g = nearestValid(cand, view) ?? g;
    // refused or merely set down: pull it into the notches nearby (Shift: no magnet)
    if (!this.freePlace && (!g.ok || g.loose)) {
      const held = this.ghost?.locks?.length ? this.ghost.spec : null;
      g = snapToLock(cand, resolveAim(this.selected, this.rot, hit, view), view, held) ?? g;
    }
    this.ghost = g;
  }

  refreshGhost() {
    this.updateFromHit(this.lastHit);
  }

  /** Places the current ghost. */
  placeGhost(): boolean {
    const g = this.ghost;
    this.pending = false;
    if (!g || this.demo.active) return false;
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
    if (this.demo.active) return;
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
    if (this.demo.active) return;
    const before = this.guide.stepIndex;
    this.build.undo();
    this.build.save();
    if (this.mode === 'guide') this.#afterGuideChange(before);
    this.refreshGhost();
  }

  redo() {
    if (this.demo.active) return;
    const before = this.guide.stepIndex;
    this.build.redo();
    this.build.save();
    if (this.mode === 'guide') this.#afterGuideChange(before);
    this.refreshGhost();
  }

  clear() {
    if (this.demo.active) return;
    this.build.clear();
    this.build.save();
    this.celebrating = false;
    if (this.mode === 'guide') this.#autoSelectForStep();
    this.ghost = null;
  }

  // -------------------------------------------------------------------------
  // Demolition

  #warmed = false;

  /**
   * Loads the physics engine in the background, and warms it up: the very first physics
   * world costs ~100 ms (engine code compiled on first use, collision shapes of the roof),
   * better paid now than at the first explosion.
   */
  preloadDemolition() {
    void loadRapier()
      .then((R) => {
        if (this.#warmed) return;
        this.#warmed = true;
        const pieces = this.build.pieces.length
          ? this.build.pieces
          : getModel(DEFAULT_MODEL_ID).steps.flatMap((s, i) => s.pieces.map((p, j) => ({ ...p, uid: i * 1000 + j + 1 })));
        const run = () => new DemoWorld(R, pieces).dispose();
        if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 3000 });
        else setTimeout(run, 100);
      })
      .catch(() => {});
  }

  /** Fires a demolition effect (starting the demolition if needed). */
  demolish(effect: DemoEffect) {
    const demo = this.demo;
    demo.menuOpen = false;
    if (demo.phase === 'rebuilding') return;
    if (demo.phase === 'idle') {
      if (!this.build.pieces.length) {
        bonk();
        this.notify('Build something first!', 'warn');
        return;
      }
      demo.pieces = this.build.pieces;
      this.ghost = null;
      this.pending = false;
      this.hoverUid = null;
      this.celebrating = false;
      this.tool = 'build';
      demo.phase = 'running';
      this.preloadDemolition();
    }
    demo.effect = effect;
    // the bomb waits for a click
    if (effect !== 'bomb') demo.shot = { id: ++this.#shotId, effect };
  }

  /** Bomb mode: a click on the scene. */
  dropBomb(point: [number, number, number]) {
    const demo = this.demo;
    if (demo.phase !== 'running' || demo.effect !== 'bomb') return;
    demo.shot = { id: ++this.#shotId, effect: 'bomb', point };
  }

  /** Puts every piece back in place (rewind animation, then the real pieces come back). */
  rebuild() {
    if (this.demo.phase === 'running') this.demo.phase = 'rebuilding';
  }

  /** End of the rewind. */
  endDemolition() {
    const demo = this.demo;
    demo.phase = 'idle';
    demo.pieces = [];
    demo.shot = null;
    this.refreshGhost();
  }

  // -------------------------------------------------------------------------
  // Guided mode

  /** "Show me": automatically places the next piece. */
  showMe() {
    if (this.mode !== 'guide' || this.demo.active) return;
    const next = this.guide.remaining.find((p) => dropHeight(this.build.index, p) === p.y);
    if (!next) return;
    this.selected = next.type;
    this.rot = axisSideToRot(next.axis, next.side ?? 1) % getDef(next.type).rotations;
    this.placeSpec(next);
    this.refreshGhost();
  }

  /** Completes the whole current step. */
  finishStep() {
    if (this.mode !== 'guide' || this.demo.active) return;
    const pieces = [...this.guide.remaining];
    pieces.forEach((p, i) =>
      setTimeout(() => {
        if (this.mode !== 'guide' || this.build.keys.has(specKey(p))) return;
        this.placeSpec(p);
      }, i * 140)
    );
  }

  /** Switches the booklet to another model; each model keeps its own progress. */
  setModel(id: string) {
    if (id === this.guide.modelId) return;
    writeStorage(stashKey(this.guide.modelId), this.guideBuild.toSpecs());
    this.guide.modelId = id;
    this.guideBuild.load(sanitizeSpecs(readJSON(stashKey(id), [])));
    this.guideBuild.save();
    this.ghost = null;
    this.pending = false;
    this.celebrating = false;
    this.savePrefs();
    this.#autoSelectForStep();
  }

  /** Progress of a model, 0 to 1 (the open model, or its saved progress). */
  progressOf(model: Model): number {
    const keys =
      model.id === this.guide.modelId
        ? this.guideBuild.keys
        : new Set(sanitizeSpecs(readJSON(stashKey(model.id), [])).map(specKey));
    let total = 0;
    let placed = 0;
    for (const s of model.steps)
      for (const p of s.pieces) {
        total++;
        if (keys.has(specKey(p))) placed++;
      }
    return total ? placed / total : 0;
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
