<script lang="ts">
  import { useThrelte } from '@threlte/core';
  import { Raycaster, Vector2, Vector3, type Intersection, type Object3D } from 'three';
  import { app } from '../app.svelte';
  import type { Hit } from '../build/placement';
  import { getDef, isRoofKind } from '../pieces/catalog';
  import { unlockAudio } from '../audio/sfx';

  const { camera, scene, dom, invalidate } = useThrelte();

  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const tmpN = new Vector3();

  const TAP_PX = 8;
  const LONG_MS = 520;

  interface Down {
    x: number;
    y: number;
    t: number;
    type: string;
    button: number;
  }
  const downs = new Map<number, Down>();
  let dragged = false;
  let multi = false;
  let longTimer: ReturnType<typeof setTimeout> | undefined;
  let longFired = false;

  function raycast(clientX: number, clientY: number): Intersection<Object3D>[] {
    const rect = dom.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera.current);
    return raycaster.intersectObjects(scene.children, true);
  }

  function hitAt(clientX: number, clientY: number, wantRoof: boolean): Hit | null {
    for (const i of raycast(clientX, clientY)) {
      const pick = i.object.userData?.pick as Hit['kind'] | undefined;
      if (!pick) continue;
      if (pick === 'roof' && !wantRoof) continue;
      // placing a roof element: see through the planks/beams/ridge caps already placed,
      // otherwise they hide the roof pick surface (which is right on top of them)
      if (pick === 'piece' && wantRoof && isRoofPiece(i.object.userData.uid)) continue;
      let normal: Hit['normal'];
      if (i.face) {
        tmpN.copy(i.face.normal).transformDirection(i.object.matrixWorld);
        normal = { x: tmpN.x, y: tmpN.y, z: tmpN.z };
      }
      return {
        kind: pick,
        point: { x: i.point.x, y: i.point.y, z: i.point.z },
        normal,
        uid: i.object.userData.uid,
        roofKey: i.object.userData.roofKey,
        side: i.object.userData.side,
        ray: {
          origin: { x: raycaster.ray.origin.x, y: raycaster.ray.origin.y, z: raycaster.ray.origin.z },
          dir: { x: raycaster.ray.direction.x, y: raycaster.ray.direction.y, z: raycaster.ray.direction.z }
        }
      };
    }
    return null;
  }

  function pieceAt(clientX: number, clientY: number): number | null {
    for (const i of raycast(clientX, clientY)) {
      const pick = i.object.userData?.pick;
      if (pick === 'piece') return i.object.userData.uid as number;
      if (pick === 'ground') return null;
    }
    return null;
  }

  /** Demolition, bomb mode: point of the table (or of a piece) under the pointer. */
  function bombPoint(clientX: number, clientY: number): [number, number, number] | null {
    for (const i of raycast(clientX, clientY)) {
      const pick = i.object.userData?.pick;
      if (pick === 'ground' || pick === 'debris') return [i.point.x, i.point.y, i.point.z];
    }
    return null;
  }

  function isRoofPiece(uid: number | undefined): boolean {
    const p = uid == null ? undefined : app.build.pieces.find((q) => q.uid === uid);
    return !!p && isRoofKind(getDef(p.type).kind);
  }

  const wantsRoof = () => !!app.selected && isRoofKind(getDef(app.selected).kind);

  function hover(e: PointerEvent) {
    if (app.tool === 'erase') {
      app.hoverUid = pieceAt(e.clientX, e.clientY);
      return;
    }
    app.freePlace = e.shiftKey;
    app.updateFromHit(hitAt(e.clientX, e.clientY, wantsRoof()));
  }

  /** Shift pressed/released without moving: drop or restore the magnet right away. */
  function setFree(free: boolean) {
    if (app.freePlace === free) return;
    app.freePlace = free;
    if (!app.pending && !app.demo.active) {
      app.refreshGhost();
      invalidate();
    }
  }
  const onKeyDown = (e: KeyboardEvent) => e.key === 'Shift' && setFree(true);
  const onKeyUp = (e: KeyboardEvent) => e.key === 'Shift' && setFree(false);
  const onBlur = () => setFree(false);

  function onDown(e: PointerEvent) {
    unlockAudio();
    downs.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), type: e.pointerType, button: e.button });
    if (downs.size > 1) {
      multi = true;
      clearTimeout(longTimer);
      return;
    }
    dragged = false;
    multi = false;
    longFired = false;
    if (e.pointerType !== 'mouse' && !app.demo.active) {
      clearTimeout(longTimer);
      longTimer = setTimeout(() => {
        if (dragged || multi) return;
        const uid = pieceAt(e.clientX, e.clientY);
        if (uid != null) {
          longFired = true;
          navigator.vibrate?.(25);
          app.erase(uid);
          invalidate();
        }
      }, LONG_MS);
    }
  }

  function onMove(e: PointerEvent) {
    const d = downs.get(e.pointerId);
    if (d) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_PX) {
        dragged = true;
        clearTimeout(longTimer);
      }
      return;
    }
    if (e.pointerType === 'mouse' && !app.pending && !app.demo.active) hover(e);
  }

  function onUp(e: PointerEvent) {
    const d = downs.get(e.pointerId);
    downs.delete(e.pointerId);
    clearTimeout(longTimer);
    if (!d || dragged || multi || longFired) {
      if (downs.size === 0) multi = false;
      return;
    }
    const isTouch = d.type !== 'mouse';
    if (app.demo.active) {
      if (isTouch || d.button === 0) {
        const p = bombPoint(e.clientX, e.clientY);
        if (p) app.dropBomb(p);
      }
      return;
    }
    if (!isTouch && d.button === 2) {
      const uid = pieceAt(e.clientX, e.clientY);
      if (uid != null) app.erase(uid);
      return;
    }
    if (!isTouch && d.button !== 0) return;

    if (app.tool === 'erase') {
      const uid = pieceAt(e.clientX, e.clientY);
      if (uid != null) app.erase(uid);
      return;
    }
    if (isTouch) {
      // tap: show the ghost and wait for confirmation (or a 2nd tap in the same spot)
      const prev = app.pending ? app.ghost : null;
      app.updateFromHit(hitAt(e.clientX, e.clientY, wantsRoof()));
      const g = app.ghost;
      if (prev && g && sameSpot(prev.spec, g.spec)) {
        app.placeGhost();
      } else {
        app.pending = !!g;
      }
    } else {
      app.updateFromHit(hitAt(e.clientX, e.clientY, wantsRoof()));
      app.placeGhost();
    }
    invalidate();
  }

  function sameSpot(a: { ix: number; iz: number; y: number; axis: string; slot?: number; side?: number }, b: typeof a) {
    return a.ix === b.ix && a.iz === b.iz && a.y === b.y && a.axis === b.axis && a.slot === b.slot && a.side === b.side;
  }

  function onCancel(e: PointerEvent) {
    downs.delete(e.pointerId);
    clearTimeout(longTimer);
  }

  function onLeave(e: PointerEvent) {
    if (e.pointerType === 'mouse' && !app.pending) {
      app.updateFromHit(null);
      app.hoverUid = null;
    }
  }

  const onContext = (e: Event) => e.preventDefault();

  $effect(() => {
    dom.style.cursor = app.demo.phase === 'running' && app.demo.effect === 'bomb' ? 'crosshair' : '';
  });

  $effect(() => {
    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    dom.addEventListener('pointerleave', onLeave);
    dom.addEventListener('contextmenu', onContext);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      dom.removeEventListener('pointerleave', onLeave);
      dom.removeEventListener('contextmenu', onContext);
    };
  });
</script>
