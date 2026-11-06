<script lang="ts">
  import { Canvas } from '@threlte/core';
  import { ACESFilmicToneMapping, PCFSoftShadowMap } from 'three';
  import { onMount } from 'svelte';
  import Scene from './lib/scene/Scene.svelte';
  import PiecePalette from './lib/ui/PiecePalette.svelte';
  import Toolbar from './lib/ui/Toolbar.svelte';
  import GuidePanel from './lib/ui/GuidePanel.svelte';
  import Icon from './lib/ui/Icon.svelte';
  import { app } from './lib/app.svelte';
  import { thumbs } from './lib/ui/thumbs.svelte';
  import { renderThumbnails } from './lib/pieces/thumbnails';
  import { getDef } from './lib/pieces/catalog';

  const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

  onMount(() => {
    // thumbnails rendered after the first frame so the scene isn't delayed
    const id = requestAnimationFrame(() => (thumbs.map = renderThumbnails()));
    return () => cancelAnimationFrame(id);
  });

  function onKey(e: KeyboardEvent) {
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) app.redo();
      else app.undo();
    } else if ((e.ctrlKey || e.metaKey) && k === 'y') {
      e.preventDefault();
      app.redo();
    } else if (k === 'r') {
      app.rotate(e.shiftKey ? -1 : 1);
    } else if (k === 'e' || k === 'delete' || k === 'backspace') {
      app.setTool(app.tool === 'erase' ? 'build' : 'erase');
    } else if (k === 'escape') {
      if (app.helpOpen) app.helpOpen = false;
      else if (app.pending) app.pending = false;
      else if (app.tool === 'erase') app.setTool('build');
      else app.select(null);
    } else if (k === 'enter' && app.pending) {
      app.placeGhost();
    } else if (k === ' ' && app.mode === 'guide') {
      e.preventDefault();
      app.showMe();
    }
  }

  function closeHelp() {
    app.helpOpen = false;
    app.savePrefs();
  }

  const selectedName = $derived(app.selected ? getDef(app.selected).name : null);
</script>

<svelte:window onkeydown={onKey} />

<main>
  <div class="stage">
    <Canvas toneMapping={ACESFilmicToneMapping} shadows={PCFSoftShadowMap} dpr={[1, 2]}>
      <Scene />
    </Canvas>
  </div>

  <Toolbar />
  <PiecePalette />
  {#if app.mode === 'guide'}
    <GuidePanel />
  {/if}

  {#if app.pending && app.ghost}
    <div class="touchbar" role="toolbar" aria-label="Confirm placement">
      <button class="round" onclick={() => app.rotate()} aria-label="Rotate" disabled={!app.selected || getDef(app.selected).rotations === 1}>
        <Icon name="rotate" size={22} />
      </button>
      <button class="round" onclick={() => ((app.pending = false), (app.ghost = null))} aria-label="Cancel">
        <Icon name="close" size={22} />
      </button>
      <button class="place" class:bad={!app.ghost.ok} onclick={() => app.placeGhost()}>
        <Icon name="check" size={22} /> Place
      </button>
    </div>
  {/if}

  <div class="status" aria-live="polite">
    {#if app.tool === 'erase'}
      <span class="chip erase">Eraser: {coarse ? 'tap' : 'click'} a piece to remove it</span>
    {:else if app.ghost && !app.ghost.ok && app.ghost.reason}
      <span class="chip warn">✋ {app.ghost.reason}</span>
    {:else if app.ghost?.locks?.length}
      <span class="chip good">✓ The notches lock together</span>
    {:else if selectedName}
      <span class="chip">
        <b>{selectedName}</b>
        {#if !coarse}· R to rotate · right click to remove{:else}· tap to place · long press to remove{/if}
      </span>
    {/if}
  </div>

  {#if app.toast}
    {#key app.toast.id}
      <div class="toast {app.toast.kind}" role="status">{app.toast.text}</div>
    {/key}
  {/if}

  {#if app.helpOpen}
    <div class="help-backdrop" role="presentation" onclick={closeHelp}>
      <div
        class="help"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        tabindex="-1"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
      >
        <h2 id="help-title">Let's build a chalet!</h2>
        <p>Take logs from the box and stack them: the <b>notches</b> fit together at the corners, just like the real wooden chalets.</p>
        <div class="cols">
          <div>
            <h3>🖱️ With the mouse</h3>
            <ul>
              <li><b>Click</b>: place the piece</li>
              <li><b>R</b>: rotate</li>
              <li><b>Right click</b>: remove</li>
              <li><b>Drag</b>: turn the camera · <b>wheel</b>: zoom</li>
              <li><b>Ctrl+Z</b> / <b>Ctrl+Y</b>: undo / redo</li>
            </ul>
          </div>
          <div>
            <h3>👆 On a tablet</h3>
            <ul>
              <li><b>Tap</b>: preview, then <b>✓ Place</b> (or tap again)</li>
              <li><b>Long press</b>: remove a piece</li>
              <li><b>1 finger</b>: turn · <b>2 fingers</b>: zoom</li>
            </ul>
          </div>
        </div>
        <p class="modes"><b>Free build</b>: build whatever you like. <b>Booklet</b>: follow the model step by step.</p>
        <button class="go" onclick={closeHelp}>Let's go!</button>
      </div>
    </div>
  {/if}
</main>

<style>
  main {
    position: fixed;
    inset: 0;
    overflow: hidden;
  }
  .stage {
    position: absolute;
    inset: 0;
    touch-action: none;
  }
  .touchbar {
    position: absolute;
    left: 50%;
    bottom: 28px;
    transform: translateX(-50%);
    display: flex;
    gap: 10px;
    padding: 8px;
    background: var(--paper);
    border: 2px solid var(--wood-dark);
    border-radius: 99px;
    box-shadow: var(--shadow);
    animation: rise 0.18s ease-out;
  }
  .round {
    width: 52px;
    height: 52px;
    border-radius: 99px;
    border: 0;
    background: var(--card);
    color: var(--ink);
    display: grid;
    place-items: center;
    cursor: pointer;
  }
  .round:disabled {
    opacity: 0.35;
  }
  .place {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font: inherit;
    font-weight: 600;
    font-size: 18px;
    padding: 0 22px;
    border-radius: 99px;
    border: 0;
    background: var(--green);
    color: #fff;
    cursor: pointer;
  }
  .place.bad {
    background: #b9a998;
  }
  .status {
    position: absolute;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    pointer-events: none;
  }
  .touchbar ~ .status {
    display: none;
  }
  .chip {
    display: inline-block;
    white-space: nowrap;
    font-size: 14px;
    color: var(--ink-soft);
    background: color-mix(in srgb, var(--paper) 88%, transparent);
    padding: 6px 14px;
    border-radius: 99px;
    box-shadow: 0 1px 4px rgba(60, 40, 20, 0.12);
  }
  .chip.erase {
    color: #fff;
    background: var(--red);
  }
  .chip.warn {
    color: #fff;
    background: #e2683c;
  }
  .chip.good {
    color: #fff;
    background: var(--green);
  }
  .toast {
    position: absolute;
    top: 84px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 18px;
    border-radius: 14px;
    font-weight: 500;
    background: var(--ink);
    color: var(--paper);
    box-shadow: var(--shadow);
    animation: drop 0.25s ease-out;
    pointer-events: none;
    max-width: calc(100% - 32px);
    text-align: center;
  }
  .toast.success {
    background: var(--green);
    color: #fff;
  }
  .toast.warn {
    background: #e2683c;
    color: #fff;
  }
  .help-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(50, 35, 20, 0.35);
    display: grid;
    place-items: center;
    padding: 16px;
    z-index: 20;
  }
  .help {
    max-width: 560px;
    width: 100%;
    max-height: 100%;
    overflow: auto;
    background: var(--paper);
    border: 3px solid var(--wood-dark);
    border-radius: 22px;
    padding: 22px 24px;
    box-shadow: var(--shadow);
    color: var(--ink);
  }
  .help h2 {
    margin: 0 0 8px;
    font-size: 26px;
  }
  .help h3 {
    font-size: 16px;
    margin: 6px 0;
  }
  .help p {
    color: var(--ink-soft);
    line-height: 1.45;
  }
  .help ul {
    margin: 0;
    padding-left: 18px;
    color: var(--ink-soft);
    line-height: 1.6;
    font-size: 14.5px;
  }
  .cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px;
    background: var(--card);
    border-radius: 14px;
    padding: 10px 14px;
  }
  .modes {
    font-size: 14.5px;
  }
  .go {
    display: block;
    margin: 8px auto 0;
    font: inherit;
    font-weight: 600;
    font-size: 18px;
    padding: 10px 28px;
    border-radius: 99px;
    border: 0;
    background: var(--green);
    color: #fff;
    cursor: pointer;
  }
  @keyframes rise {
    from {
      transform: translate(-50%, 12px);
      opacity: 0;
    }
  }
  @keyframes drop {
    from {
      transform: translate(-50%, -10px);
      opacity: 0;
    }
  }
  @media (max-width: 760px) {
    .touchbar {
      bottom: 182px;
    }
    .status {
      bottom: 178px;
    }
    .toast {
      top: 64px;
    }
    .cols {
      grid-template-columns: 1fr;
    }
  }
</style>
