import type { DemoEffect } from '../app.svelte';

export const EFFECTS: { id: DemoEffect; icon: 'blast' | 'tornado' | 'quake' | 'bomb'; label: string; hint: string }[] = [
  { id: 'explosion', icon: 'blast', label: 'Explosion', hint: 'Blow it all up' },
  { id: 'tornado', icon: 'tornado', label: 'Tornado', hint: 'The wind takes the roof first' },
  { id: 'quake', icon: 'quake', label: 'Earthquake', hint: 'The table shakes, the chalet collapses' },
  { id: 'bomb', icon: 'bomb', label: 'Bombs', hint: 'Click to drop bombs where you want' }
];
