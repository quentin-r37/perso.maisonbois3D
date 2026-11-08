import { beforeAll, describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import type { PlacedPiece } from '../build/grid';
import { MODELS } from '../guide/models';
import { loadRapier } from './rapier';
import { explode, quake, runningQuake, tornado } from './effects';
import { resetFx } from './fx';
import { DemoWorld, type Impact, type Rapier } from './world';

let R: Rapier;
beforeAll(async () => {
  R = await loadRapier();
});

const chalet = (i = 0): PlacedPiece[] =>
  MODELS[i].steps.flatMap((s) => s.pieces).map((p, uid) => ({ ...p, uid: uid + 1 }));

const run = (w: DemoWorld, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) w.step(1 / 60);
};

/** Largest distance between a piece and its place in the chalet. */
const maxDrift = (w: DemoWorld) =>
  Math.max(
    ...w.debris.map((d) => {
      const p = d.body.translation();
      return Math.hypot(p.x - d.home.p[0], p.y - d.home.p[1], p.z - d.home.p[2]);
    })
  );

describe('demolition world', () => {
  for (const [i, m] of MODELS.entries()) {
    it(`${m.id}: the chalet stands still until something hits it`, () => {
      const w = new DemoWorld(R, chalet(i));
      run(w, 2);
      expect(maxDrift(w)).toBeLessThan(1e-3);
      w.dispose();
    });

    it(`${m.id}: brought to life without any push, the chalet barely settles`, () => {
      const w = new DemoWorld(R, chalet(i));
      for (const d of w.debris) w.activate(d);
      run(w, 2);
      // a few centimetres of settling at most, nothing flies off
      expect(maxDrift(w)).toBeLessThan(0.15);
      w.dispose();
    });
  }

  it('an explosion throws the pieces around, none goes through the table', () => {
    resetFx();
    const w = new DemoWorld(R, chalet());
    explode(w, w.center, 16);
    run(w, 1);
    // the whole chalet goes, not just the roof
    const moved = w.debris.filter((d) => {
      const p = d.body.translation();
      return Math.hypot(p.x - d.home.p[0], p.y - d.home.p[1], p.z - d.home.p[2]) > 0.5;
    });
    expect(moved.length).toBeGreaterThan(w.debris.length * 0.7);
    run(w, 2.5);
    // (centre of mass: the origin of a piece is at one end, it can be anywhere once it tumbled)
    for (const d of w.debris) if (!d.lost) expect(d.body.worldCom().y).toBeGreaterThan(0);
    w.dispose();
  });

  it('a bomb only blows up what is near it', () => {
    resetFx();
    const w = new DemoWorld(R, chalet());
    const [cx, , cz] = w.center;
    // on the table, a step away from a wall (where people click)
    const hit = explode(w, [cx + 2.6, 0, cz], 15, 3.2);
    expect(hit).toBeGreaterThan(3);
    expect(hit).toBeLessThan(w.debris.length);
    run(w, 1);
    expect(maxDrift(w)).toBeGreaterThan(0.5);
    w.dispose();
  });

  it('the tornado lifts the pieces, the quake makes the chalet collapse', () => {
    resetFx();
    const a = new DemoWorld(R, chalet());
    a.addField(tornado(a, 3));
    run(a, 2.5);
    expect(maxDrift(a)).toBeGreaterThan(1);
    a.dispose();

    const b = new DemoWorld(R, chalet());
    b.addField(quake(b));
    run(b, 5);
    // the chalet really collapses: most of its pieces end up far from their place
    const fallen = b.debris.filter((d) => {
      const p = d.body.translation();
      return Math.hypot(p.x - d.home.p[0], p.y - d.home.p[1], p.z - d.home.p[2]) > 0.3;
    });
    expect(fallen.length).toBeGreaterThan(b.debris.length * 0.5);
    b.dispose();
  });

  it('clicking "earthquake" twice renews the quake, nothing gets launched into the sky', () => {
    resetFx();
    const w = new DemoWorld(R, chalet());
    w.addField(quake(w));
    run(w, 0.5);
    // what Demolition.svelte does on the second click
    runningQuake(w)!.renew(4);
    expect(w.fields).toHaveLength(1);
    let maxY = 0;
    for (let t = 0; t < 5; t += 1 / 60) {
      w.step(1 / 60);
      for (const d of w.debris) if (!d.lost) maxY = Math.max(maxY, d.body.worldCom().y);
    }
    // (two stacked quakes used to throw pieces hundreds of metres up)
    expect(maxY).toBeLessThan(w.top + 4);
    w.dispose();
  });
});

describe('impacts and friction (sounds)', () => {
  const oneLog: PlacedPiece[] = [{ type: 'medium', ix: 0, iz: 0, y: 0, axis: 'x', uid: 1 }];

  /** Drops a single log from `h` metres and records the impacts. */
  const drop = (h: number) => {
    const hits: Impact[] = [];
    const w = new DemoWorld(R, oneLog, { onImpact: (e) => hits.push(e) });
    const d = w.debris[0];
    w.activate(d);
    const p = d.body.translation();
    d.body.setTranslation({ x: p.x, y: p.y + h, z: p.z }, true);
    run(w, 1.5);
    w.dispose();
    return hits;
  };

  it('a heavy fall and a small drop are very different impacts', () => {
    const high = drop(2);
    const low = drop(0.01);
    expect(high[0].surface).toBe('table');
    // free fall: v = sqrt(2 g h)
    expect(high[0].speed).toBeGreaterThan(6);
    // ~0.56 m/s in theory
    expect(low[0].speed).toBeLessThan(0.9);
  });

  it('a log sliding on the table rubs (no string of impacts)', () => {
    const hits: Impact[] = [];
    const w = new DemoWorld(R, oneLog, { onImpact: (e) => hits.push(e) });
    const d = w.debris[0];
    w.activate(d);
    run(w, 0.5);
    hits.length = 0;
    d.body.setLinvel({ x: 2.5, y: 0, z: 0 }, true);
    let rub = 0;
    for (let t = 0; t < 0.4; t += 1 / 60) {
      w.step(1 / 60);
      rub = Math.max(rub, w.slide.table.power);
    }
    expect(rub).toBeGreaterThan(0.2);
    expect(hits.filter((h) => h.speed > 0.5)).toHaveLength(0);
    w.dispose();
  });
});

describe('drawing between physics steps', () => {
  it('in slow motion, a falling piece moves on every frame (no stutter)', () => {
    const w = new DemoWorld(R, [{ type: 'medium', ix: 0, iz: 0, y: 0, axis: 'x', uid: 1 }]);
    const d = w.debris[0];
    w.activate(d);
    const p = d.body.translation();
    d.body.setTranslation({ x: p.x, y: p.y + 2, z: p.z }, true);
    run(w, 0.2);
    const pos = new Vector3();
    const rot = new Quaternion();
    const ys: number[] = [];
    // 14 frames at 60 fps, game time slowed down to 0.15: physics steps only every ~7 frames
    for (let i = 0; i < 14; i++) {
      w.step((1 / 60) * 0.15);
      w.pose(d, pos, rot);
      ys.push(pos.y);
    }
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeLessThan(ys[i - 1]);
    w.dispose();
  });
});
