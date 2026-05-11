# Craft Project Plan

## Vision

Craft is a single-player browser voxel survival prototype focused on smooth chunk streaming, stable distant terrain, responsive building/mining, and a small but expandable survival loop.

The project should stay browser-first: efficient chunk meshes, worker-side generation, simple persistence, and predictable controls matter more than heavy simulation.

## Current State

The prototype currently supports:

- First-person movement, jumping, and block collision.
- Worker-generated chunks.
- Greedy voxel meshing.
- Repeating texture atlas shader for merged faces.
- Chunk fade-in for streamed terrain.
- Far terrain heightfield ring.
- Biome-driven terrain generation.
- Snow, forest, plains, hills, beach, and dry areas.
- Trees, flowers, tall grass, ores, and surface variation.
- Block breaking with crack animation.
- Block placement with placement preview.
- Held item/tool visuals.
- Persistent modified chunks through IndexedDB.
- Persistent inventory and hotbar bindings.
- Inventory overlay with item categories and hotbar assignment.
- F3 diagnostic overlay with frame, render, world, worker, memory, and supported GPU timing counters.

## Guiding Constraints

- Keep terrain data separate from render meshes.
- Keep chunk generation and meshing off the main thread.
- Append block IDs only; do not reorder existing enum values.
- Prefer simple, robust systems before rich simulation.
- Keep visual features cheap enough for WebGL/browser use.
- Verify with `npm run build` after meaningful changes.

## Roadmap

### Milestone 1: Stabilize The Core

Goal: make the current prototype easier to extend without regressions.

Tasks:

- Split `src/main.ts` into focused modules:
  - renderer/scene setup
  - input/player
  - inventory/crafting
  - persistence
  - interaction/building
  - UI/HUD
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

- Main app file is no longer the central dumping ground.
- World reset/debug controls exist.
- Build passes.
- Existing movement, mining, placing, persistence, and inventory still work.

### Milestone 2: Inventory And Items

Goal: turn the current count-map inventory into a more game-like item system.

Tasks:

- Replace count-map inventory with slot-based storage.
- Add stack limits.
- Add item definitions as data rather than scattered switch statements.
- Add item pickup entities.
- Add dropped block/item pickups after mining.
- Add tool durability.
- Add mining drop rules:
  - stone drops cobblestone
  - ores require pickaxes
  - better tools mine faster
- Add a cleaner crafting UI.

Exit criteria:

- Inventory has real slots.
- Items can be picked up from the world.
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

- Add static water surfaces.
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
- Add chunk mesh memory accounting.
- Add worker prioritization by camera direction.
- Add optional lower render-distance profile.
- Investigate WebGPU only after WebGL path is solid.

Exit criteria:

- Distant terrain remains stable.
- Chunk updates are smooth.
- Visual quality improves without large frame-time spikes.

## Near-Term Recommended Order

1. Refactor `src/main.ts` into modules.
2. Add clear-world/debug panel.
3. Convert inventory to slot-based storage.
4. Add item pickup entities.
5. Add mining drop rules and durability.
6. Add furnace/smelting.
7. Add static water and caves.

## Known Risks

- `src/main.ts` is too large and will slow future work if not split soon.
- IndexedDB saves can obscure terrain-generation changes during testing.
- Block enum numeric IDs are persistence-sensitive.
- Greedy meshing plus transparent blocks needs careful material separation.
- Inventory and hotbar are currently hybrid count-based systems, not real item containers.

## Current Priority

The next best engineering task is refactoring before adding more gameplay. The prototype now has enough systems that continued feature work in `src/main.ts` will become error-prone.
