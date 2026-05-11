# Craft Project Plan

## Vision

Craft is a single-player browser voxel survival prototype focused on smooth chunk streaming, stable distant terrain, responsive building/mining, and a small but expandable survival loop.

The project should stay browser-first: efficient chunk meshes, worker-side generation, simple persistence, and predictable controls matter more than heavy simulation.

## Current State

The prototype currently supports:

- First-person movement, jumping, and block collision.
- Persistent mouse sensitivity control for pointer-lock camera movement.
- Worker-pool generated chunks.
- Greedy voxel meshing.
- Repeating texture atlas shader for merged faces.
- Warm original-style sky, fog, water shading, terrain atlas colors, and pixel hotbar styling.
- Chunk fade-in for streamed terrain.
- Far terrain heightfield ring merged into a single mesh for low draw-call overhead.
- Biome-driven terrain generation.
- Snow, forest, plains, hills, beach, and dry areas.
- Static water fills terrain basins up to the shared water level, with spawn selection avoiding submerged starts.
- Trees, flowers, tall grass, ores, and surface variation.
- Block breaking with crack animation.
- Block placement with placement preview.
- Held item/tool visuals.
- Wildlife with simple animal hit interactions and collision against loaded terrain blocks.
- Persistent modified chunks through IndexedDB.
- Modified chunk storage keys include a chunk storage version so generator-level visual changes do not reuse stale chunk meshes near spawn.
- Persistent inventory and hotbar bindings.
- Slot-based inventory with stack limits, migration from older count-map saves, item categories, crafting, and hotbar assignment.
- Item pickup entities for mined block drops, with collection into available inventory slots.
- Sky, terrain atlas generation, terrain shader materials, far terrain, held-item rendering, diagnostics, persistence, inventory/crafting, HUD setup, seed utilities, player movement, block raycasting/interaction, and wildlife simulation now live outside `src/main.ts` under owned modules.
- F3 diagnostic overlay with frame, render, world, worker, memory, and supported GPU timing counters.

## Guiding Constraints

- Keep terrain data separate from render meshes.
- Keep chunk generation and meshing off the main thread in the worker pool.
- Use loaded chunk block data, not generated terrain height alone, for gameplay collision and interactions.
- Append block IDs only; do not reorder existing enum values.
- Prefer simple, robust systems before rich simulation.
- Keep visual features cheap enough for WebGL/browser use.
- Keep TypeScript files under the ESLint 650 effective-line cap; split by owned systems before files approach that size.
- Prefer hierarchical modules with durable ownership over broad lateral helper-file splits.
- Verify with `npm run build` after meaningful changes.

## Roadmap

### Milestone 1: Stabilize The Core

Goal: make the current prototype easier to extend without regressions.

Tasks:

- Split `src/main.ts` into focused modules:
  - renderer/scene setup, continuing from `src/rendering/*`
  - chunk streaming/world lifecycle
- Add a debug/settings panel.
- Add a clear-world button for IndexedDB saves.
- Add render distance controls.
- Add basic performance counters:
  - visible chunks
  - queued chunks
  - triangle count
  - worker queue length
  - frame timing and GPU timing where supported
- Document persistence format.

Exit criteria:

- Main app file keeps shrinking behind owned systems and stays under the ESLint line cap.
- World reset/debug controls exist.
- Build passes.
- Existing movement, mining, placing, persistence, and inventory still work.

### Milestone 2: Inventory And Items

Goal: turn the current count-map inventory into a more game-like item system.

Tasks:

- [x] Replace count-map inventory with slot-based storage.
- [x] Add stack limits.
- [x] Add item definitions as data rather than scattered switch statements.
- [x] Preserve old count-map inventory saves with migration into slot snapshots.
- [x] Add item pickup entities.
- [x] Add dropped block/item pickups after mining.
- Add tool durability.
- Add mining drop rules:
  - stone drops cobblestone
  - ores require pickaxes
  - better tools mine faster
- Add a cleaner crafting UI.

Exit criteria:

- Inventory has real slots. Done.
- Items can be picked up from the world. Done for mined block drops.
- Tool use has durability and meaningful mining rules.

### Milestone 3: Building Improvements

Goal: make building feel intentional and useful.

Tasks:

- Add rotateable/variant blocks where useful.
- Add better placement validation.
- Add block preview using actual block material/texture.
- Add glass placement.
- Add doors or simple slabs/stairs.
- Add chest block and small container UI.
- Add creative/debug item grant controls for testing.

Exit criteria:

- Building is predictable.
- Several crafted/placeable blocks have distinct purposes.
- Container interaction exists.

### Milestone 4: Survival Lite

Goal: create a minimal progression loop beyond mining and placing.

Tasks:

- Add furnace/smelting UI.
- Smelt iron/copper/gold ore.
- Add iron pickaxe.
- Add health.
- Add fall damage.
- Add basic food items.
- Add simple hostile or environmental threat later.
- Add day/night cycle only after lighting strategy is clear.

Exit criteria:

- Player can progress from wood to stone to metal tools.
- Furnace has a working queue.
- Survival has at least one resource pressure.

### Milestone 5: World Systems

Goal: make exploration more rewarding.

Tasks:

- Improve water rendering with a separated transparent/reflection pass if the current shader-only water becomes limiting.
- Add lakes and shoreline improvements.
- Add caves using 3D noise.
- Add richer tree variants.
- Add more surface features:
  - rocks
  - mushrooms
  - berry bushes
  - cactus
  - pumpkins
- Add biome transitions and local color variation.
- Add basic wildlife only if it remains cheap.

Exit criteria:

- World has visible variety across biomes.
- Caves and ores create exploration goals.
- Water exists as a stable non-flowing first pass.

### Milestone 6: Rendering And Performance

Goal: improve visual quality without losing browser performance.

Tasks:

- Restore ambient occlusion compatible with greedy meshing.
- Add transparent-material separation for decorations/glass/water.
- Improve far terrain LOD blending.
- Move far terrain rebuilds off the immediate chunk-boundary path or make them incremental.
- Add chunk mesh memory accounting.
- Add worker prioritization by camera direction.
- Add optional lower render-distance profile.
- Investigate WebGPU only after WebGL path is solid.

Exit criteria:

- Distant terrain remains stable.
- Chunk updates are smooth.
- Visual quality improves without large frame-time spikes.

## Near-Term Recommended Order

1. Add mining drop rules and tool durability.
2. Continue refactoring `src/main.ts` into owned modules, next targeting chunk streaming/world lifecycle.
3. Add clear-world/debug panel.
4. Add furnace/smelting.
5. Add static water and caves.

## Known Risks

- `src/main.ts` is smaller but still owns too many systems; continue splitting with care.
- IndexedDB saves can obscure terrain-generation changes during testing.
- Block enum numeric IDs are persistence-sensitive.
- Greedy meshing plus transparent blocks needs careful material separation.
- Hotbar bindings still point at item types rather than concrete inventory slots.

## Current Priority

Milestone 2 is active. The next best gameplay task is adding mining drop rules and tool durability so mined blocks no longer all produce one direct block/item drop. New feature work should stay in owned modules instead of expanding `src/main.ts`.
