<script lang="ts">
  import { app } from '../app.svelte';
  import { thumbs } from './thumbs.svelte';

  let { onclose }: { onclose: () => void } = $props();

  let name = $state('My chalet');
  let busy = $state(false);
  let progress = $state<{ done: number; total: number } | null>(null);
  let error = $state('');

  async function create(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    error = '';
    progress = null;
    try {
      const { exportNotice } = await import('../notice/pdf');
      const ok = await exportNotice({
        name,
        pieces: app.sandbox.toSpecs(),
        thumbs: thumbs.map,
        onProgress: (done, total) => (progress = { done, total })
      });
      if (ok) onclose();
      else error = "The pictures couldn't be drawn on this device.";
    } catch (err) {
      console.error(err);
      error = 'Something went wrong while making the booklet.';
    } finally {
      busy = false;
    }
  }

  function onKey(e: KeyboardEvent) {
    e.stopPropagation();
    if (e.key === 'Escape' && !busy) onclose();
  }
</script>

<div class="backdrop" role="presentation" onclick={() => !busy && onclose()}>
  <div
    class="dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="notice-title"
    tabindex="-1"
    onclick={(e) => e.stopPropagation()}
    onkeydown={onKey}
  >
    <form onsubmit={create}>
    <h2 id="notice-title">Building instructions</h2>
    <p>Turn your build into a printable booklet (PDF): the list of pieces, then one picture for each step.</p>
    <label>
      <span>Name of your model</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input type="text" bind:value={name} maxlength="40" disabled={busy} autofocus />
    </label>
    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
    <div class="actions">
      <button type="button" class="cancel" disabled={busy} onclick={onclose}>Cancel</button>
      <button type="submit" class="go" disabled={busy}>
        {#if !busy}Create the booklet{:else if progress}Step {progress.done} / {progress.total}…{:else}Getting ready…{/if}
      </button>
    </div>
    </form>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(50, 35, 20, 0.35);
    display: grid;
    place-items: center;
    padding: 16px;
    z-index: 20;
  }
  .dialog {
    max-width: 420px;
    width: 100%;
    background: var(--paper);
    border: 3px solid var(--wood-dark);
    border-radius: 22px;
    padding: 22px 24px;
    box-shadow: var(--shadow);
    color: var(--ink);
  }
  h2 {
    margin: 0 0 8px;
    font-size: 24px;
  }
  p {
    margin: 0 0 14px;
    color: var(--ink-soft);
    line-height: 1.45;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-weight: 500;
  }
  input {
    font: inherit;
    font-size: 17px;
    padding: 9px 12px;
    border-radius: 12px;
    border: 2px solid var(--line);
    background: #fff;
    color: var(--ink);
    user-select: text;
  }
  input:focus {
    outline: none;
    border-color: var(--green);
  }
  .error {
    margin: 12px 0 0;
    color: var(--red);
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 18px;
  }
  button {
    font: inherit;
    font-weight: 600;
    font-size: 16px;
    padding: 10px 20px;
    border-radius: 99px;
    border: 0;
    cursor: pointer;
  }
  .cancel {
    background: var(--card);
    color: var(--ink);
  }
  .go {
    background: var(--green);
    color: #fff;
    min-width: 12ch;
  }
  button:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
