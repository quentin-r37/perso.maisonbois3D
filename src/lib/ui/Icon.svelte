<script lang="ts">
  type Name =
    | 'undo'
    | 'redo'
    | 'rotate'
    | 'eraser'
    | 'sound'
    | 'mute'
    | 'menu'
    | 'check'
    | 'close'
    | 'help'
    | 'download'
    | 'upload'
    | 'trash'
    | 'magic'
    | 'forward'
    | 'hand';
  let { name, size = 20 }: { name: Name; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === 'undo'}
    <path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  {:else if name === 'redo'}
    <path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  {:else if name === 'rotate'}
    <path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" />
  {:else if name === 'eraser'}
    <path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 19" /><path d="M22 21H7" /><path d="m5 11 9 9" />
  {:else if name === 'sound'}
    <path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7" /><path d="M19 5a10 10 0 0 1 0 14" />
  {:else if name === 'mute'}
    <path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="m22 9-6 6" /><path d="m16 9 6 6" />
  {:else if name === 'menu'}
    <circle cx="5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="19" cy="12" r="1.3" />
  {:else if name === 'check'}
    <path d="M20 6 9 17l-5-5" />
  {:else if name === 'close'}
    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
  {:else if name === 'help'}
    <circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><path d="M12 17h.01" />
  {:else if name === 'download'}
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" />
  {:else if name === 'upload'}
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m17 8-5-5-5 5" /><path d="M12 3v12" />
  {:else if name === 'trash'}
    <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  {:else if name === 'magic'}
    <path d="m15 4 1.5 3L20 8.5 16.5 10 15 13l-1.5-3L10 8.5 13.5 7z" /><path d="M4 20 13 11" />
  {:else if name === 'forward'}
    <path d="m13 17 5-5-5-5" /><path d="m6 17 5-5-5-5" />
  {:else if name === 'hand'}
    <path d="M18 11V6a2 2 0 0 0-4 0v5" /><path d="M14 10V4a2 2 0 0 0-4 0v6" /><path d="M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15" />
  {/if}
</svg>
