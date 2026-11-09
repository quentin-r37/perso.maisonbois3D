<script lang="ts">
  import { T, useTask, useThrelte } from '@threlte/core';
  import { OrbitControls } from '@threlte/extras';
  import { Color, DirectionalLight, Fog, Group, HemisphereLight, PMREMGenerator } from 'three';
  import { QUALITY } from '../ui/quality';
  import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
  import { app } from '../app.svelte';
  import { getDef, isRoofKind } from '../pieces/catalog';
  import { specKey } from '../build/snap';
  import Table from './Table.svelte';
  import Piece from './Piece.svelte';
  import Ghost from './Ghost.svelte';
  import RoofPickers from './RoofPickers.svelte';
  import PlacementController from './PlacementController.svelte';
  import Celebration from './Celebration.svelte';
  import LockMarkers from './LockMarkers.svelte';
  import Demolition from './Demolition.svelte';
  import DemolitionFx from './DemolitionFx.svelte';
  import { fx } from '../destroy/fx';
  import { countFrame } from '../ui/fps.svelte';

  const { scene, renderer, renderStage, invalidate } = useThrelte();

  // frame counter: a task of the render stage only runs on the frames really drawn
  useTask(countFrame, { stage: renderStage, autoInvalidate: false });

  const BG = '#efe4d2';
  scene.background = new Color(BG);
  scene.fog = new Fog(BG, 40, 100);
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  pmrem.dispose();

  const build = $derived(app.build);
  const target = $derived<[number, number, number]>(app.mode === 'guide' ? app.guide.model.center : [1.5, 0.8, 1.5]);
  const showRoofPickers = $derived(
    !!app.selected && app.tool === 'build' && !app.demo.active && isRoofKind(getDef(app.selected).kind)
  );

  const ghostKey = $derived(app.ghost ? specKey(app.ghost.spec) : '');
  const blueprints = $derived(
    app.mode === 'guide' && !app.guide.done && !app.demo.active
      ? app.guide.remaining.filter((p) => specKey(p) !== ghostKey)
      : []
  );

  // quality slider: shadows on/off and their resolution. Turning castShadow off (and not
  // only the renderer's shadow map) changes the lights' state, so three recompiles the
  // materials without the shadow lookup instead of sampling a stale map.
  const sunShadows = $derived(QUALITY[app.quality].shadows !== false);
  const shadowSize = $derived(QUALITY[app.quality].shadowSize);
  let sun: DirectionalLight | undefined = $state();
  $effect(() => {
    const size = shadowSize;
    if (!sun || sun.shadow.mapSize.x === size) return;
    sun.shadow.mapSize.set(size, size);
    // the map is created at its size once: drop it, three makes a new one on the next frame
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    invalidate();
  });

  // explosion flash: the ambient light flares up (adding a light would recompile every shader)
  const HEMI = 0.9;
  let hemi: HemisphereLight | undefined = $state();

  // screen shake: the whole world (table + pieces) jitters, the camera stays put
  let world: Group | undefined = $state();
  useTask(
    (delta) => {
      if (hemi) hemi.intensity = HEMI + fx.flash * 5;
      if (!world) return;
      const s = fx.shake;
      if (s < 0.002) {
        if (world.position.lengthSq() || world.rotation.z) {
          world.position.set(0, 0, 0);
          world.rotation.set(0, 0, 0);
        }
        return;
      }
      const r = () => Math.random() - 0.5;
      world.position.set(r() * s * 0.28, r() * s * 0.14, r() * s * 0.28);
      world.rotation.set(r() * s * 0.012, 0, r() * s * 0.012);
      fx.shake = s * Math.exp(-Math.min(delta, 0.05) * 4.5);
    },
    { autoInvalidate: false }
  );
</script>

<T.PerspectiveCamera makeDefault position={[5.5, 6, -8.5]} fov={38} near={0.1} far={200}>
  <OrbitControls
    enableDamping
    dampingFactor={0.12}
    target={target}
    maxPolarAngle={Math.PI * 0.47}
    minDistance={2}
    maxDistance={60}
    autoRotate={app.celebrating}
    autoRotateSpeed={1.6}
  />
</T.PerspectiveCamera>

<T.HemisphereLight bind:ref={hemi} args={['#fff6e8', '#8a6a4a', HEMI]} />
<T.DirectionalLight
  bind:ref={sun}
  position={[-5, 11, -7]}
  intensity={2.4}
  color="#fff1dc"
  castShadow={sunShadows}
  shadow.camera.left={-9}
  shadow.camera.right={9}
  shadow.camera.top={9}
  shadow.camera.bottom={-9}
  shadow.camera.near={1}
  shadow.camera.far={45}
  shadow.bias={-0.0004}
  shadow.normalBias={0.02}
  oncreate={(light) => {
    light.target.position.set(1.5, 0, 1.5);
    light.target.updateMatrixWorld();
  }}
/>
<T.DirectionalLight position={[10, 6, 12]} intensity={0.5} color="#dfe8ff" />

<T.Group bind:ref={world}>
  <Table />

  <!-- the pieces stay mounted during a demolition (hidden): remounting them all costs a frame freeze -->
  {#each build.pieces as piece (piece.uid)}
    <Piece
      {piece}
      doorOpen={build.doors.get(piece.uid)}
      animate={build.consumeFresh(piece.uid)}
      highlight={app.tool === 'erase' && app.hoverUid === piece.uid}
      hidden={app.demo.active}
    />
  {/each}
  {#if app.demo.active}
    <Demolition pieces={app.demo.pieces} />
  {/if}
  <!-- always mounted: its shaders are compiled at startup, not at the first explosion -->
  <DemolitionFx active={app.demo.active} />
</T.Group>

{#each blueprints as spec (specKey(spec))}
  <Ghost {spec} variant="blueprint" />
{/each}

{#if app.ghost && app.tool === 'build' && !app.demo.active}
  <Ghost spec={app.ghost.spec} variant={!app.ghost.ok ? 'bad' : app.ghost.loose ? 'loose' : 'ok'} />
  {#if app.ghost.ok && app.ghost.locks?.length}
    <LockMarkers locks={app.ghost.locks} />
  {/if}
{/if}

{#if showRoofPickers}
  <RoofPickers roofs={build.roofs} />
{/if}

{#if app.celebrating}
  <Celebration center={target} />
{/if}

<PlacementController />
