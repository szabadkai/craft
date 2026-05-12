# Craft Repo Context

This is a browser Minecraft-like voxel prototype built with Vite, TypeScript, and Three.js.

## Run Commands

- Install: `npm install`
- Dev server: `npm run dev -- --port 5174`
- Build check: `npm run build`

## Architecture

- `src/main.ts`
  Main app loop, Three.js scene composition, player/inventory/input orchestration, block interaction wiring, held item visuals.
- `src/rendering/terrainMaterials.ts`
  Sky mesh, generated terrain atlas, and terrain shader material factory.
- `src/rendering/diagnostics.ts`
  F3 diagnostics collection, GPU timer handling, summary formatting, and overlay painting.
- `src/rendering/farTerrain.ts`
  Merged far terrain heightfield ring generation and mesh ownership.
- `src/rendering/heldItemView.ts`
  First-person held block/tool meshes and hand swing animation.
- `src/inventory/items.ts`
  Item, held-item, recipe, and inventory definition data.
- `src/inventory/inventorySystem.ts`
  Slot inventory, crafting, Minecraft-style hotbar slots, overlay painting, and inventory persistence snapshots.
- `src/inventory/furnaceRecipes.ts`
  Data-driven furnace inputs, outputs, fuel burn times, and smelting helpers.
- `src/inventory/furnaceSystem.ts`
  Per-block furnace state, smelting tick/update logic, furnace UI painting, inventory transfer handling, and furnace persistence snapshots.
- `src/world/wildlife.ts`
  Wildlife spawning, mesh construction, lifetime cleanup, entity ray hits, loaded-world collision, and per-frame movement simulation.
- `src/world/chunkWorldSystem.ts`
  Loaded chunk ownership, worker-pool requests, remeshing, chunk persistence saves, block access/mutation, spawn readiness, fade-in, and world diagnostics summary.
- `src/world/blockRaycaster.ts`
  Solid block raycast traversal for camera-targeted interaction.
- `src/world/blockInteractionSystem.ts`
  Block highlight, placement preview, mining state, crack overlay, block hardness, and placement/mining effects.
- `src/player/playerController.ts`
  Player state, movement integration, collision resolution, and camera sync.
- `src/persistence/worldStore.ts`
  IndexedDB access for modified chunks, inventory, and hotbar state.
- `src/ui/hud.ts`
  HUD/start-screen DOM creation and typed element lookup.
- `src/world/seed.ts`
  Seed hashing and random seed text generation.
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
- Persistent mouse sensitivity control for pointer-lock camera movement.
- Worker-pool generated chunks.
- Greedy meshing.
- Repeating texture atlas shader.
- Warm original-style sky, fog, water, atlas colors, and pixel hotbar styling.
- Biomes: plains, forest, hills, beach, snow, dry.
- Static water fills low terrain basins up to the shared terrain water level.
- Surface details: flowers, tall grass, trees.
- Ores: coal, iron, copper, gold, diamond.
- Persistent modified chunks via IndexedDB.
- Start-screen world tools can clear saved chunks, inventory, and legacy hotbar state for the selected seed.
- Persistent inventory and legacy hotbar migration via IndexedDB.
- Slot-based inventory with stack limits, count-map save migration, tabs, crafting, item counts, and Minecraft-style hotbar slots.
- Furnace block interaction UI with per-furnace smelting queues, fuel consumption, ore ingots, and output collection.
- Item pickup entities for mined block drops.
- Mining drop rules and pickaxe durability.
- Iron pickaxe progression after furnace smelting, with diamond mining gated behind iron tier.
- Recipe-card crafting UI with output and requirement visibility.
- Health system: 20 HP, pixel-art hearts (top-left HUD), fall damage (>3 blocks), death, and respawn at surface.
- Caves with 3D-noise caverns, worm tunnels, surface entrances, and large chambers.
- Place preview now uses the terrain atlas texture with per-face tile mapping so the ghost block matches the placed block's actual appearance.
- Console command system (`` ` `` key) with `give <item> [count]`, `items`, `help`, `clear`, tab completion.
- Wildlife with simple animal hit interactions and collision against loaded terrain blocks.
- Far terrain heightfield ring merged into a single mesh to keep draw calls low.
- F3 diagnostic overlay with FPS, frame timing, render stats, worker pressure, memory estimates, and GPU timing when supported.

## Important Implementation Notes

- Block IDs in the `Block` enum must only be appended, not reordered, because saved chunks store numeric IDs.
- Chunk data is `Uint16Array`.
- World edits should go through `ChunkWorldSystem.setBlock(...)` so saves and remeshes stay coordinated.
- Furnace contents/progress are persisted separately from chunk block data, keyed by world seed and furnace block position.
- Main thread should not generate terrain meshes directly.
- Chunk generation and remeshing jobs are distributed across a small worker pool.
- Far terrain is generated on the main thread today, but it should stay merged into a small number of meshes; avoid reintroducing one mesh per far patch.
- Terrain shader expects:
  - `uv`: repeated local face UVs.
  - `atlasRect`: vec4 of atlas tile rect.
  - `color`: lighting and variation.
- Transparent plant blocks are decorations and should not be treated as solid raycast targets.
- Wildlife movement uses loaded chunk blocks for ground and obstacle collision; avoid falling back to generated height only for gameplay collision.
- Health state (`src/player/health.ts`) tracks HP, fall distance, death, and respawn. `reconcile()` handles per-frame fall damage and hearts DOM display. Hearts are 8×8 canvas-drawn pixel sprites (full red with white border, half, empty outline) rendered at 2× nearest-neighbour scale.
- Caves are generated in `src/terrain.ts` via `isCaveBlock`: 3D value noise caverns (scale 64), worm tunnels (crossed noise, narrow 0.51–0.58 band), surface entrances (scale 14, near-surface), and large chambers (scale 72).
- Place preview rebuilds the BoxGeometry UVs per selected block via `atlasBoxGeometry`, mapping each face to the correct atlas tile using `tileForBlockFace`.
- Console commands are defined in `src/ui/console.ts`. The `give` command resolves item IDs via `itemDefs` fuzzy matching.
- Existing IndexedDB saves can make old chunks appear near spawn after generator changes.
- ESLint enforces a 650 effective-line cap for TypeScript files. Run `npm run lint` regularly during refactors and split modules along durable system boundaries before files approach the cap.
- Refactors should prefer hierarchical ownership such as `rendering/*`, `world/*`, `inventory/*`, or `player/*`; avoid scattering small lateral helper files without a clear parent system.

## Documentation Maintenance

- Keep `AGENTS.md` and `docs/project-plan.md` up to date when changing architecture, persistence formats, major systems, current features, roadmap priorities, or known risks.
- When completing a milestone or adding a substantial feature, update the "Current Features", "Good Next Tasks", and project roadmap as needed.
- If implementation details change in a way future agents must know, document them here before finishing the task.

## Good Next Tasks

- Add rotateable/variant blocks (log orientation, etc.).
- Add doors or simple slabs/stairs.
- Add chest block and small container UI.
- Add basic food items and eating.
- Separate transparent render paths for glass/water if richer translucency becomes necessary.
- Move far terrain rebuilds off the immediate chunk-boundary path or make them incremental.
