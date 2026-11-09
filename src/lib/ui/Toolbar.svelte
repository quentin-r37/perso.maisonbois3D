<script lang="ts">
  import { app } from '../app.svelte';
  import { sanitizeSpecs } from '../build/store.svelte';
  import { getDef } from '../pieces/catalog';
  import Icon from './Icon.svelte';
  import { EFFECTS } from './demolition';

  let menuOpen = $state(false);
  let confirmClear = $state(false);
  let fileInput: HTMLInputElement;

  const demo = $derived(app.demo.active);
  const canRotate = $derived(!demo && !!app.selected && app.tool === 'build' && getDef(app.selected).rotations > 1);

  function toggleDemolish() {
    if (app.demo.active) {
      app.rebuild();
      return;
    }
    app.demo.menuOpen = !app.demo.menuOpen;
    menuOpen = false;
    if (app.demo.menuOpen) app.preloadDemolition();
  }

  function exportFile() {
    const blob = new Blob([app.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chalet-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    menuOpen = false;
  }

  async function importFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    app.importJSON(await file.text(), sanitizeSpecs);
    (e.currentTarget as HTMLInputElement).value = '';
    menuOpen = false;
  }

  function clearAll() {
    if (!confirmClear) {
      confirmClear = true;
      setTimeout(() => (confirmClear = false), 2500);
      return;
    }
    confirmClear = false;
    menuOpen = false;
    app.clear();
  }
</script>

<div class="bar">
  <div class="brand">
    <span class="logo" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="30" height="30">
        <path d="M3 15 16 5l13 10" fill="none" stroke="#5fae2e" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" />
        <rect x="7" y="15" width="18" height="12" rx="1.5" fill="#d9a066" />
        <path d="M7 19h18M7 23h18" stroke="#a8703c" stroke-width="1.4" />
        <rect x="13.5" y="18" width="5" height="9" rx="0.8" fill="#d42a25" />
      </svg>
    </span>
    <span class="title">Wooden chalet</span>
  </div>

  <div class="seg" role="tablist" aria-label="Mode">
    <button role="tab" aria-selected={app.mode === 'libre'} class:on={app.mode === 'libre'} disabled={demo} onclick={() => app.setMode('libre')}>
      Free build
    </button>
    <button role="tab" aria-selected={app.mode === 'guide'} class:on={app.mode === 'guide'} disabled={demo} onclick={() => app.setMode('guide')}>
      Booklet
    </button>
  </div>

  <div class="tools">
    <button class="icon" title="Undo (Ctrl+Z)" disabled={demo || !app.build.canUndo} onclick={() => app.undo()}><Icon name="undo" /></button>
    <button class="icon" title="Redo (Ctrl+Y)" disabled={demo || !app.build.canRedo} onclick={() => app.redo()}><Icon name="redo" /></button>
    <span class="sep"></span>
    <button class="icon" title="Rotate (R)" disabled={!canRotate} onclick={() => app.rotate()}><Icon name="rotate" /></button>
    <button
      class="icon"
      class:active={app.tool === 'erase'}
      title="Remove pieces (E)"
      disabled={demo}
      onclick={() => app.setTool(app.tool === 'erase' ? 'build' : 'erase')}
    >
      <Icon name="eraser" />
    </button>
    <button
      class="icon"
      class:active={app.tool === 'door'}
      title="Open / close doors and shutters (O)"
      disabled={demo}
      onclick={() => app.setTool(app.tool === 'door' ? 'build' : 'door')}
    >
      <Icon name="hand" />
    </button>
    <div class="menu-wrap">
      <button
        class="icon boom"
        class:active={demo}
        title={demo ? 'Rebuild (Esc)' : 'Demolish! (X)'}
        aria-expanded={app.demo.menuOpen}
        disabled={app.demo.phase === 'rebuilding'}
        onclick={toggleDemolish}
        onpointerenter={() => app.preloadDemolition()}
      >
        <Icon name={demo ? 'house' : 'bomb'} />
      </button>
      {#if app.demo.menuOpen && !demo}
        <div class="menu demolish" role="menu">
          {#each EFFECTS as e, i (e.id)}
            <button role="menuitem" onclick={() => app.demolish(e.id)}>
              <Icon name={e.icon} size={18} />
              <span class="label"><b>{e.label}</b><small>{e.hint}</small></span>
              <kbd>{i + 1}</kbd>
            </button>
          {/each}
        </div>
      {/if}
    </div>
    <span class="sep"></span>
    <button class="icon" title={app.muted ? 'Turn sound on' : 'Mute'} onclick={() => app.toggleMute()}>
      <Icon name={app.muted ? 'mute' : 'sound'} />
    </button>
    <div class="menu-wrap">
      <button class="icon" title="More" aria-expanded={menuOpen} onclick={() => ((menuOpen = !menuOpen), (app.demo.menuOpen = false))}>
        <Icon name="menu" />
      </button>
      {#if menuOpen}
        <div class="menu" role="menu">
          <button role="menuitem" onclick={() => ((app.helpOpen = true), (menuOpen = false))}><Icon name="help" size={18} /> Help</button>
          <button role="menuitem" disabled={demo} onclick={exportFile}><Icon name="download" size={18} /> Export (JSON)</button>
          <button role="menuitem" disabled={demo} onclick={() => fileInput.click()}><Icon name="upload" size={18} /> Import…</button>
          <button role="menuitem" class="danger" disabled={demo} onclick={clearAll}>
            <Icon name="trash" size={18} />
            {confirmClear ? 'Confirm?' : app.mode === 'guide' ? 'Start the model over' : 'Clear everything'}
          </button>
        </div>
      {/if}
    </div>
  </div>
  <input bind:this={fileInput} type="file" accept="application/json,.json" hidden onchange={importFile} />
</div>

<style>
  .bar {
    position: absolute;
    top: 16px;
    left: 16px;
    right: 16px;
    display: flex;
    align-items: center;
    gap: 12px;
    pointer-events: none;
  }
  .bar > * {
    pointer-events: auto;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 14px 6px 8px;
    background: var(--paper);
    border-radius: 99px;
    box-shadow: var(--shadow);
    border: 2px solid var(--wood-dark);
  }
  .title {
    font-weight: 600;
    font-size: 18px;
    color: var(--ink);
    white-space: nowrap;
  }
  .seg {
    display: flex;
    background: var(--paper);
    border-radius: 99px;
    padding: 4px;
    box-shadow: var(--shadow);
    border: 2px solid var(--wood-dark);
  }
  .seg button {
    font: inherit;
    font-weight: 500;
    font-size: 15px;
    border: 0;
    background: transparent;
    color: var(--ink-soft);
    padding: 6px 14px;
    border-radius: 99px;
    cursor: pointer;
  }
  .seg button.on {
    background: var(--green);
    color: #fff;
  }
  .tools {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    background: var(--paper);
    border-radius: 99px;
    box-shadow: var(--shadow);
    border: 2px solid var(--wood-dark);
  }
  .icon {
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border-radius: 99px;
    border: 0;
    background: transparent;
    color: var(--ink);
    cursor: pointer;
  }
  .icon:hover:not(:disabled) {
    background: var(--card);
  }
  .icon:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .icon.active {
    background: var(--red);
    color: #fff;
  }
  .sep {
    width: 1.5px;
    height: 22px;
    background: var(--line);
    margin: 0 2px;
  }
  .menu-wrap {
    position: relative;
  }
  .menu {
    position: absolute;
    right: 0;
    top: 48px;
    min-width: 220px;
    background: var(--paper);
    border: 2px solid var(--wood-dark);
    border-radius: 14px;
    box-shadow: var(--shadow);
    padding: 6px;
    display: flex;
    flex-direction: column;
    z-index: 10;
  }
  .menu button {
    display: flex;
    align-items: center;
    gap: 10px;
    font: inherit;
    font-size: 15px;
    text-align: left;
    border: 0;
    background: transparent;
    color: var(--ink);
    padding: 9px 10px;
    border-radius: 10px;
    cursor: pointer;
  }
  .menu button:hover {
    background: var(--card);
  }
  .menu .danger {
    color: var(--red);
  }
  .menu button:disabled {
    opacity: 0.4;
    cursor: default;
    background: transparent;
  }
  .seg button:disabled {
    cursor: default;
    opacity: 0.6;
  }
  .icon.boom:hover:not(:disabled):not(.active) {
    background: #ffe2d6;
    color: #c2410c;
  }
  .menu.demolish {
    min-width: 280px;
  }
  .menu.demolish button {
    align-items: center;
  }
  .label {
    display: flex;
    flex-direction: column;
    flex: 1;
    line-height: 1.2;
  }
  .label b {
    font-weight: 600;
  }
  .label small {
    color: var(--ink-soft);
    font-size: 12.5px;
  }
  kbd {
    font: inherit;
    font-size: 12px;
    color: var(--ink-soft);
    border: 1.5px solid var(--line);
    border-radius: 6px;
    padding: 0 6px;
  }

  @media (max-width: 760px) {
    .bar {
      top: 10px;
      left: 10px;
      right: 10px;
      flex-wrap: wrap;
      gap: 8px;
    }
    .brand {
      display: none;
    }
    .seg button {
      padding: 6px 10px;
      font-size: 14px;
    }
    .icon {
      width: 36px;
      height: 36px;
    }
  }
</style>
