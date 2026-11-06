<script lang="ts">
  import { app } from '../app.svelte';
  import { MODELS, type Model } from '../guide/models';
  import { getDef } from '../pieces/catalog';
  import { thumbs } from './thumbs.svelte';
  import Icon from './Icon.svelte';

  const g = app.guide;
  const steps = $derived(g.model.steps.length);
  const pct = $derived(Math.round((g.placedCount / g.totalPieces) * 100));
  let collapsed = $state(false);
  /** The model list; opens by itself when nothing has been built yet. */
  let choosing = $state(MODELS.length > 1 && g.placedCount === 0);
  /** Progress of every model, read when the list opens. */
  const progress = $derived(choosing ? new Map(MODELS.map((m) => [m.id, app.progressOf(m)])) : new Map<string, number>());
  const count = (m: Model) => m.steps.reduce((n, s) => n + s.pieces.length, 0);

  function choose(id: string) {
    app.setModel(id);
    choosing = false;
    collapsed = false;
  }
</script>

<section class="booklet" class:collapsed aria-label="Instruction booklet">
  <header>
    <button class="toggle" onclick={() => (collapsed = !collapsed)} aria-expanded={!collapsed}>
      <span class="kicker">Booklet</span>
      <span class="model">{g.model.name}</span>
    </button>
    {#if MODELS.length > 1}
      <button class="change" class:on={choosing} onclick={() => ((choosing = !choosing), (collapsed = false))} aria-expanded={choosing}>
        {choosing ? 'Close' : 'Models'}
      </button>
    {/if}
  </header>

  <div class="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
    <span style:width="{pct}%"></span>
  </div>

  {#if !collapsed}
    {#if choosing}
      <div class="choose">
        <h2>Which chalet will you build?</h2>
        <ul class="models">
          {#each MODELS as m (m.id)}
            {@const p = progress.get(m.id) ?? 0}
            <li>
              <button class="card" class:current={m.id === g.modelId} onclick={() => choose(m.id)}>
                <span class="cover">
                  {#if thumbs.models[m.id]}<img src={thumbs.models[m.id]} alt="" />{/if}
                  {#if p >= 1}<span class="badge done">★ Built</span>
                  {:else if p > 0}<span class="badge">{Math.round(p * 100)} %</span>{/if}
                </span>
                <span class="body">
                  <span class="name">{m.name}</span>
                  <span class="desc">{m.description}</span>
                  <span class="meta">
                    <span class="level" title="Difficulty" aria-label="Difficulty {m.level} of 3">
                      {#each [1, 2, 3] as i (i)}<span class:lit={i <= m.level}>●</span>{/each}
                    </span>
                    <span>{count(m)} pieces · {m.steps.length} steps</span>
                  </span>
                </span>
              </button>
            </li>
          {/each}
        </ul>
        <p class="tip">Each chalet keeps its progress: you can come back to it later.</p>
      </div>
    {:else if g.done}
      <div class="done">
        <div class="medal" aria-hidden="true">★</div>
        <h2>Well done!</h2>
        <p>Your chalet is finished. Turn the camera to admire it, or build it again.</p>
        <div class="actions">
          <button class="btn" onclick={() => app.restartGuide()}>Start over</button>
          {#if MODELS.length > 1}
            <button class="btn primary" onclick={() => (choosing = true)}>Another chalet</button>
          {:else}
            <button class="btn primary" onclick={() => app.setMode('libre')}>Free build</button>
          {/if}
        </div>
      </div>
    {:else if g.step}
      <div class="page">
        <div class="stepno">
          <span class="num">{g.stepIndex + 1}</span>
          <span class="of">/ {steps}</span>
        </div>
        <h2>{g.step.title}</h2>
        {#if g.step.hint}<p class="hint">{g.step.hint}</p>{/if}

        <ul class="needs">
          {#each [...g.stepNeeds] as [type, n] (type)}
            <li>
              <button class:sel={app.selected === type && app.tool === 'build'} onclick={() => app.select(type)} title={getDef(type).name}>
                {#if thumbs.map[type]}<img src={thumbs.map[type]} alt="" />{/if}
                <span class="label">{getDef(type).name}</span>
                <span class="n">×{n}</span>
              </button>
            </li>
          {/each}
        </ul>

        <p class="tip">Place the pieces on the <b class="blue">blue</b> outlines.</p>

        <div class="actions">
          <button class="btn" onclick={() => app.showMe()} title="Place the next piece for me">
            <Icon name="magic" size={18} /> Show me
          </button>
          <button class="btn" onclick={() => app.finishStep()} title="Finish the step automatically">
            <Icon name="forward" size={18} /> Whole step
          </button>
        </div>
      </div>
    {/if}
  {/if}
</section>

<style>
  .booklet {
    position: absolute;
    right: 16px;
    top: 84px;
    width: 300px;
    max-height: calc(100% - 100px);
    overflow: auto;
    background: var(--paper);
    border: 2px solid var(--wood-dark);
    border-radius: 18px;
    box-shadow: var(--shadow);
    background-image: linear-gradient(transparent 31px, rgba(120, 90, 60, 0.07) 32px);
    background-size: 100% 32px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 14px 6px;
  }
  .toggle {
    all: unset;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  .kicker {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--red);
    font-weight: 600;
  }
  .model {
    font-size: 17px;
    font-weight: 600;
    color: var(--ink);
  }
  .change {
    font: inherit;
    font-size: 13.5px;
    font-weight: 600;
    padding: 6px 12px;
    border-radius: 99px;
    border: 2px solid var(--wood-dark);
    background: var(--paper);
    color: var(--ink);
    cursor: pointer;
    flex-shrink: 0;
  }
  .change:hover,
  .change.on {
    background: var(--card);
  }
  .choose {
    padding: 0 14px 14px;
  }
  .models {
    list-style: none;
    padding: 0;
    margin: 8px 0 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .card {
    width: 100%;
    display: flex;
    gap: 10px;
    align-items: stretch;
    padding: 6px;
    border-radius: 14px;
    border: 2px solid transparent;
    background: var(--card);
    font: inherit;
    color: var(--ink);
    text-align: left;
    cursor: pointer;
  }
  .card:hover {
    border-color: var(--line);
  }
  .card.current {
    border-color: var(--green);
    background: var(--green-soft);
  }
  .cover {
    position: relative;
    flex: 0 0 92px;
    height: 72px;
    border-radius: 10px;
    background: var(--paper);
    overflow: hidden;
  }
  .cover img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .badge {
    position: absolute;
    left: 4px;
    bottom: 4px;
    font-size: 11.5px;
    font-weight: 700;
    color: #fff;
    background: #3d9bff;
    border-radius: 99px;
    padding: 0 7px;
  }
  .badge.done {
    background: var(--green);
  }
  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .name {
    font-weight: 600;
    font-size: 15px;
  }
  .desc {
    font-size: 13px;
    line-height: 1.3;
    color: var(--ink-soft);
  }
  .meta {
    margin-top: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
    color: var(--ink-soft);
  }
  .level {
    letter-spacing: 1px;
    color: var(--line);
  }
  .level .lit {
    color: var(--wood-dark);
  }
  .bar {
    height: 8px;
    margin: 4px 14px 10px;
    border-radius: 99px;
    background: var(--card);
    overflow: hidden;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--green);
    border-radius: 99px;
    transition: width 0.3s;
  }
  .page,
  .done {
    padding: 0 14px 14px;
  }
  .stepno {
    display: flex;
    align-items: baseline;
    gap: 4px;
  }
  .num {
    font-size: 40px;
    line-height: 1;
    font-weight: 700;
    color: var(--wood-dark);
  }
  .of {
    color: var(--ink-soft);
  }
  h2 {
    margin: 4px 0 6px;
    font-size: 19px;
    font-weight: 600;
    color: var(--ink);
  }
  .hint {
    margin: 0 0 10px;
    color: var(--ink-soft);
    font-size: 14.5px;
    line-height: 1.4;
  }
  .needs {
    list-style: none;
    padding: 0;
    margin: 0 0 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .needs button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 10px 4px 4px;
    border-radius: 12px;
    border: 2px solid transparent;
    background: var(--card);
    font: inherit;
    color: var(--ink);
    cursor: pointer;
    text-align: left;
  }
  .needs button.sel {
    border-color: var(--green);
    background: var(--green-soft);
  }
  .needs img {
    width: 44px;
    height: 44px;
    object-fit: contain;
  }
  .label {
    flex: 1;
    font-size: 14.5px;
  }
  .n {
    font-weight: 700;
    color: #fff;
    background: #3d9bff;
    border-radius: 99px;
    padding: 1px 9px;
    font-size: 14px;
  }
  .tip {
    font-size: 13.5px;
    color: var(--ink-soft);
    margin: 0 0 12px;
  }
  .blue {
    color: #2f86e6;
  }
  .actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .btn {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font: inherit;
    font-size: 14.5px;
    font-weight: 500;
    padding: 9px 12px;
    border-radius: 12px;
    border: 2px solid var(--wood-dark);
    background: var(--paper);
    color: var(--ink);
    cursor: pointer;
  }
  .btn:hover {
    background: var(--card);
  }
  .btn.primary {
    background: var(--green);
    border-color: var(--green);
    color: #fff;
  }
  .done {
    text-align: center;
  }
  .medal {
    font-size: 52px;
    color: var(--yellow);
    text-shadow: 0 2px 0 #c9a21a;
    line-height: 1;
    margin-top: 6px;
  }
  .done p {
    color: var(--ink-soft);
    font-size: 14.5px;
  }

  @media (max-width: 760px) {
    .booklet {
      left: 10px;
      right: 10px;
      top: 64px;
      width: auto;
      max-height: 42%;
      border-radius: 16px;
    }
    .booklet.collapsed {
      max-height: none;
    }
    .num {
      font-size: 28px;
    }
    .needs {
      flex-direction: row;
      flex-wrap: wrap;
    }
    .needs li {
      flex: 1 1 140px;
    }
  }
</style>
