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
- Rotatable log orientation: logs placed horizontally align with clicked face.
- Persistent modified chunks via IndexedDB.
- Start-screen world tools can clear saved chunks, inventory, and legacy hotbar state for the selected seed.
- Persistent inventory and legacy hotbar migration via IndexedDB.
- Slot-based inventory with stack limits, count-map save migration, tabs, crafting, item counts, and Minecraft-style hotbar slots.
- Furnace block interaction UI with per-furnace smelting queues, fuel consumption, ore ingots, and output collection.
- Chest block with 27-slot container UI, inventory transfer, persistence, and drop-on-break.
- Item pickup entities for mined block drops.
- Mining drop rules and pickaxe durability.
- Sticks occasionally drop from breaking leaves (~22%).
- Iron pickaxe progression after furnace smelting, with diamond mining gated behind iron tier.
- Recipe-card crafting UI with output and requirement visibility.
- Health system: 20 HP, pixel-art hearts (top-left HUD), fall damage (>3 blocks), death, and respawn at surface.
- Food items (apple, raw meat, cooked meat) with eating system (progress bar, HP healing, consumption via right-click).
- Caves with 3D-noise caverns, worm tunnels, surface entrances, and large chambers.
- Place preview now uses the terrain atlas texture with per-face tile mapping so the ghost block matches the placed block's actual appearance.
- Console command system (`` ` `` key) with `give <item> [count]`, `items`, `help`, `clear`, tab completion.
- Wildlife with simple animal hit interactions and collision against loaded terrain blocks.
- Far terrain heightfield ring merged into a single mesh to keep draw calls low.
- F3 diagnostic overlay with FPS, frame timing, render stats, worker pressure, memory estimates, and GPU timing when supported.
- First-person held item view with proper scale (~75% larger) and closer to camera.
- Damage flash overlay (red screen vignette on hit).
- Continuous mining while holding mouse1 — chains into next block when current one breaks.
- Oak doors — two-tall openable blocks with right-click toggle, door state persistence, and planks-based recipe (6 planks → 3 doors).

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
- Oak doors use two block IDs (`OakDoor`=closed solid, `OakDoorOpen`=open non-solid) plus `DoorSystem` (`src/world/doorSystem.ts`) for orientation tracking. `DoorSystem.place()` places both halves, `toggle()` swaps between closed/open block IDs, `remove()` clears both halves. Persistence via `WorldStore.loadDoors/saveDoors` keyed by seed. Doors are placed two-tall; breaking either half removes both and drops one item.
- Place preview rebuilds the BoxGeometry UVs per selected block via `atlasBoxGeometry`, mapping each face to the correct atlas tile using `tileForBlockFace`.
- Console commands are defined in `src/ui/console.ts`. The `give` command resolves item IDs via `itemDefs` fuzzy matching.
- Existing IndexedDB saves can make old chunks appear near spawn after generator changes.
- ESLint enforces a 650 effective-line cap for TypeScript files. Run `npm run lint` regularly during refactors and split modules along durable system boundaries before files approach the cap.
- Refactors should prefer hierarchical ownership such as `rendering/*`, `world/*`, `inventory/*`, or `player/*`; avoid scattering small lateral helper files without a clear parent system.

## Documentation Maintenance

- Keep `AGENTS.md` and `docs/project-plan.md` up to date when changing architecture, persistence formats, major systems, current features, roadmap priorities, or known risks.
- When completing a milestone or adding a substantial feature, update the "Current Features", "Good Next Tasks", and project roadmap as needed.
- If implementation details change in a way future agents must know, document them here before finishing the task.

## Known Bugs / UX Issues

- Held block/tool can clip behind nearby solid terrain when the player stands next to a wall.
- Damage overlay duration (300ms) could be tuned to feel more substantial.
- Animal hit animation is missing (no flinch/pushback).
- Birch logs lack orientation variants.
- Oak door open state renders as invisible (air block) — no visual door panel when open.

## Good Next Tasks

- Add slabs/stairs — variable-height blocks with stair collision shapes.
- Add birch log orientation variants (matching LogX/LogZ pattern).
- Separate transparent render paths for glass/water if richer translucency becomes necessary.
- Move far terrain rebuilds off the immediate chunk-boundary path or make them incremental.
- Add more surface features: rocks, shoreline improvements.
- Add door open visual (thin panel rendering instead of invisible when open).
