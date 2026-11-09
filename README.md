# Wooden chalet 3D

Build log chalets in the browser, like the wooden notched-log construction toys.
Svelte 5 + Threlte 8 + three.js. No assets: geometries, wood textures and sounds are all procedural.

**Live demo:** https://quentin-r37.github.io/perso.maisonbois3D/

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # stacking solver + replay of the guided models
npm run check    # svelte-check
npm run build
```

## Modes
- **Free build**: unlimited pieces, saved automatically (localStorage), JSON export/import.
- **Booklet**: a model to follow step by step (blue outlines, "Show me", kit inventory).

## Structure
- `src/lib/build/`: grid, stacking solver (`snap.ts`), roofs (`roof.ts`), placement, store (undo/redo).
- `src/lib/pieces/`: catalogue, procedural geometries, wood materials, thumbnails.
- `src/lib/guide/models/`: guided models (`petit-chalet.ts`) and their generator (`build.ts`).
- `src/lib/scene/`: Threlte components (scene, pieces, ghost, pointer controller).
- `src/lib/ui/`: palette, toolbar, booklet.

## Pieces (like the real kit)
Only **three logs**: small (a single notch), medium (2 notches, 5 G apart) and long
(3 notches: 3 G + 5 G, so the middle notch is off-center: **the long log is not two mediums**).
An opening (door, window) fills a medium wall between two **small** logs crossed at the corners.
Roof: 2 gables, 4 battens (2 per slope), planks of a single size, long + short ridge caps, chimney.

## Notch rule
Grid in G (0.6 world units), heights in quarter-logs (Q). A parallel piece rests on the top of the piece
below; a piece crossed **at a notch of both pieces** fits in by `topNotch + bottomNotch` (2 Q);
crossed away from a notch, it just rests on top. Hence the half-log offset at the corners
(the side walls start raised, with no half-log).

## Adding a model
Build it in free build mode → export the JSON, or write it with the helpers
(`wallSteps`, `roofPieces`, …) and add it to `MODELS`. The `models.test.ts` test checks that every piece
lands exactly at its declared height.
