import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  // Relative paths: the game works under https://<user>.github.io/<repo>/ as well as locally.
  base: './',
  plugins: [svelte()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
} as any);
