<script lang="ts">
  import { T, useThrelte } from '@threlte/core';
  import { OrbitControls } from '@threlte/extras';
  import { Color, Fog, PMREMGenerator } from 'three';
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

  const { scene, renderer } = useThrelte();

  const BG = '#efe4d2';
  scene.background = new Color(BG);
  scene.fog = new Fog(BG, 20, 45);
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  pmrem.dispose();

  const build = $derived(app.build);
  const target = $derived<[number, number, number]>(app.mode === 'guide' ? app.guide.model.center : [1.5, 0.8, 1.5]);
  const showRoofPickers = $derived(!!app.selected && app.tool === 'build' && isRoofKind(getDef(app.selected).kind));

  const ghostKey = $derived(app.ghost ? specKey(app.ghost.spec) : '');
  const blueprints = $derived(
    app.mode === 'guide' && !app.guide.done ? app.guide.remaining.filter((p) => specKey(p) !== ghostKey) : []
  );
</script>

<T.PerspectiveCamera makeDefault position={[5.5, 6, -8.5]} fov={38} near={0.1} far={200}>
  <OrbitControls
    enableDamping
    dampingFactor={0.12}
    target={target}
    maxPolarAngle={Math.PI * 0.47}
    minDistance={2}
    maxDistance={30}
    autoRotate={app.celebrating}
    autoRotateSpeed={1.6}
  />
</T.PerspectiveCamera>

<T.HemisphereLight args={['#fff6e8', '#8a6a4a', 0.9]} />
<T.DirectionalLight
  position={[-5, 11, -7]}
  intensity={2.4}
  color="#fff1dc"
  castShadow
  shadow.mapSize={[2048, 2048]}
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

<Table />

{#each build.pieces as piece (piece.uid)}
  <Piece {piece} animate={build.consumeFresh(piece.uid)} highlight={app.tool === 'erase' && app.hoverUid === piece.uid} />
{/each}

{#each blueprints as spec (specKey(spec))}
  <Ghost {spec} variant="blueprint" />
{/each}

{#if app.ghost && app.tool === 'build'}
  <Ghost spec={app.ghost.spec} variant={app.ghost.ok ? 'ok' : 'bad'} />
{/if}

{#if showRoofPickers}
  <RoofPickers roofs={build.roofs} />
{/if}

{#if app.celebrating}
  <Celebration center={target} />
{/if}

<PlacementController />
