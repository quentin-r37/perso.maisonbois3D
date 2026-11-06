<script lang="ts">
  import { app } from '../app.svelte';
  import { CATALOG, CATEGORIES, type Category } from '../pieces/catalog';
  import { thumbs } from './thumbs.svelte';

  let category = $state<Category>('rondins');

  const items = $derived.by(() => {
    if (app.mode === 'guide') {
      const types = app.guide.modelTypes;
      const needs = app.guide.stepNeeds;
      return CATALOG.filter((d) => types.includes(d.id))
        .map((d) => ({ def: d, count: app.guide.inventory.get(d.id) ?? 0, needed: needs.get(d.id) ?? 0 }))
        .sort((a, b) => b.needed - a.needed);
    }
    return CATALOG.filter((d) => d.category === category).map((d) => ({ def: d, count: -1, needed: 0 }));
  });
</script>

<aside class="palette" aria-label="Box of pieces">
  <header>
    <span class="lid">{app.mode === 'guide' ? 'The kit' : 'The box'}</span>
    {#if app.mode === 'guide'}
      <span class="progress">{app.guide.placedCount} / {app.guide.totalPieces}</span>
    {/if}
  </header>

  {#if app.mode === 'libre'}
    <nav class="tabs">
      {#each CATEGORIES as c (c.id)}
        <button class:active={category === c.id} onclick={() => (category = c.id)}>{c.label}</button>
      {/each}
    </nav>
  {/if}

  <div class="grid">
    {#each items as { def, count, needed } (def.id)}
      <button
        class="item"
        class:selected={app.selected === def.id && app.tool === 'build'}
        class:needed={needed > 0}
        class:empty={count === 0}
        disabled={count === 0}
        title={def.name}
        onclick={() => app.select(app.selected === def.id && app.tool === 'build' ? null : def.id)}
      >
        {#if thumbs.map[def.id]}
          <img src={thumbs.map[def.id]} alt="" draggable="false" />
        {:else}
          <span class="ph"></span>
        {/if}
        <span class="name">{def.name}</span>
        {#if count >= 0}
          <span class="count" class:hot={needed > 0}>×{count}</span>
        {/if}
      </button>
    {/each}
  </div>
</aside>

<style>
  .palette {
    position: absolute;
    left: 16px;
    top: 84px;
    bottom: 16px;
    width: 236px;
    display: flex;
    flex-direction: column;
    background: var(--paper);
    border: 2px solid var(--wood-dark);
    border-radius: 18px;
    box-shadow: var(--shadow);
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: repeating-linear-gradient(90deg, #c98b4e 0 22px, #c28448 22px 24px);
    color: #fff;
    font-weight: 600;
    text-shadow: 0 1px 0 rgba(0, 0, 0, 0.25);
  }
  .lid {
    font-size: 17px;
  }
  .progress {
    font-size: 13px;
    background: rgba(0, 0, 0, 0.18);
    padding: 2px 8px;
    border-radius: 99px;
  }
  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 8px 8px 4px;
  }
  .tabs button {
    flex: 1 1 auto;
    font: inherit;
    font-size: 12.5px;
    padding: 5px 8px;
    border-radius: 99px;
    border: 1.5px solid var(--line);
    background: transparent;
    color: var(--ink-soft);
    cursor: pointer;
  }
  .tabs button.active {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--paper);
  }
  .grid {
    flex: 1;
    overflow-y: auto;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 8px;
    align-content: start;
  }
  .item {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 4px 6px;
    border-radius: 12px;
    border: 2px solid transparent;
    background: var(--card);
    cursor: pointer;
    font: inherit;
    color: var(--ink);
    transition: transform 0.12s, border-color 0.12s, background 0.12s;
  }
  .item:hover:not(:disabled) {
    transform: translateY(-2px);
  }
  .item.selected {
    border-color: var(--green);
    background: var(--green-soft);
  }
  .item.needed:not(.selected) {
    border-color: #8cc0ff;
  }
  .item.empty {
    opacity: 0.35;
    cursor: default;
  }
  img,
  .ph {
    width: 72px;
    height: 72px;
    object-fit: contain;
    pointer-events: none;
  }
  .name {
    font-size: 12px;
    line-height: 1.15;
    text-align: center;
  }
  .count {
    position: absolute;
    top: 4px;
    right: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .count.hot {
    color: #fff;
    background: #3d9bff;
    border-radius: 99px;
    padding: 0 6px;
  }

  @media (max-width: 760px) {
    .palette {
      left: 0;
      right: 0;
      top: auto;
      bottom: 0;
      width: auto;
      height: 168px;
      border-radius: 18px 18px 0 0;
      border-width: 2px 0 0;
    }
    header {
      padding: 6px 14px;
    }
    .tabs {
      flex-wrap: nowrap;
      overflow-x: auto;
      padding: 6px 8px 2px;
    }
    .tabs button {
      flex: 0 0 auto;
    }
    .grid {
      display: flex;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 6px 8px 10px;
    }
    .item {
      flex: 0 0 84px;
    }
    img,
    .ph {
      width: 56px;
      height: 56px;
    }
  }
</style>
