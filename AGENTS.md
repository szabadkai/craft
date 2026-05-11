# Craft Repo Context

This is a browser Minecraft-like voxel prototype built with Vite, TypeScript, and Three.js.

## Run Commands

- Install: `npm install`
- Dev server: `npm run dev -- --port 5174`
- Build check: `npm run build`

## Architecture

- `src/main.ts`
  Main app loop, Three.js scene, player movement, inventory UI, persistence, terrain atlas generation, input, block interaction, held item visuals.
- `src/chunkWorker.ts`
  Web Worker entry. Generates/remeshes chunks off the main thread.
- `src/terrain.ts`
  Deterministic terrain generation, biomes, trees, surface details, ores.
- `src/mesh.ts`
  Greedy voxel meshing. Emits repeated atlas UVs and atlas rect attributes for the terrain shader.
- `src/atlas.ts`
  Atlas tile IDs and tile rect mapping.
- `src/blocks.ts`
  Solid block registry and block colors.
- `src/types.ts`
  Core constants, block enum, worker message types.

## Current Features

- First-person movement and collision.
- Worker-pool generated chunks.
- Greedy meshing.
- Repeating texture atlas shader.
- Biomes: plains, forest, hills, beach, snow, dry.
- Surface details: flowers, tall grass, trees.
- Ores: coal, iron, copper, gold, diamond.
- Persistent modified chunks via IndexedDB.
- Persistent inventory and hotbar via IndexedDB.
- Inventory overlay with tabs, item counts, and hotbar assignment.
- Held item/tool visuals and mining swing animation.
- Far terrain heightfield ring merged into a single mesh to keep draw calls low.
- F3 diagnostic overlay with FPS, frame timing, render stats, worker pressure, memory estimates, and GPU timing when supported.

## Important Implementation Notes

- Block IDs in the `Block` enum must only be appended, not reordered, because saved chunks store numeric IDs.
- Chunk data is `Uint16Array`.
- World edits must call `scheduleChunkSave(key)` and then `remesh(...)`.
- Main thread should not generate terrain meshes directly.
- Chunk generation and remeshing jobs are distributed across a small worker pool.
- Far terrain is generated on the main thread today, but it should stay merged into a small number of meshes; avoid reintroducing one mesh per far patch.
- Terrain shader expects:
  - `uv`: repeated local face UVs.
  - `atlasRect`: vec4 of atlas tile rect.
  - `color`: lighting and variation.
- Transparent plant blocks are decorations and should not be treated as solid raycast targets.
- Greedy meshing currently merges by block, atlas tile, and face orientation.
- Existing IndexedDB saves can make old chunks appear near spawn after generator changes.

## Documentation Maintenance

- Keep `AGENTS.md` and `docs/project-plan.md` up to date when changing architecture, persistence formats, major systems, current features, roadmap priorities, or known risks.
- When completing a milestone or adding a substantial feature, update the "Current Features", "Good Next Tasks", and project roadmap as needed.
- If implementation details change in a way future agents must know, document them here before finishing the task.

## Good Next Tasks

- Split `src/main.ts` into modules. It has grown too large.
- Replace count-map inventory with slot-based inventory.
- Add item pickup entities.
- Add tool durability and mining drop rules.
- Add furnace/smelting UI.
- Add water as static surfaces first.
- Add settings/debug panel for render distance and clearing saved world.
- Move far terrain rebuilds off the immediate chunk-boundary path or make them incremental.
