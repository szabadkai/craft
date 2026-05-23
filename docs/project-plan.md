# Craft Project Plan

## Vision

Craft is a single-player browser voxel survival prototype focused on smooth chunk streaming, stable distant terrain, responsive building/mining, and a small but expandable survival loop.

The project should stay browser-first: efficient chunk meshes, worker-side generation, simple persistence, and predictable controls matter more than heavy simulation.

## Current State

The prototype currently supports:

- First-person movement, jumping, block collision, and grounded half-block auto-step for stairs/slabs.
- Persistent mouse sensitivity control for pointer-lock camera movement.
- Persistent render-distance control with a 2-chunk Low profile for weaker devices.
- Worker-pool generated chunks.
- Chunk worker requests and incoming mesh adoption are biased toward the camera direction after nearby chunks.
- Production build splits Three.js into bounded vendor chunks so the main app bundle stays below Vite's large-chunk warning threshold.
- F3 chunk mesh memory accounting includes opaque, water, transparent, and decoration mesh buffers.
- Greedy terrain faces include per-corner ambient occlusion baked into vertex colors; AO values are part of the merge key so incompatible faces do not merge.
- Greedy voxel meshing.
- Repeating texture atlas shader for merged faces.
- Warm original-style sky, fog, water shading, terrain atlas colors, and pixel hotbar styling.
- Chunk fade-in for streamed terrain.
- Far terrain heightfield ring generated in a worker and merged into a single mesh for low draw-call overhead.
- Budgeted main-thread chunk mesh adoption with deferred disposal to reduce visible stutter when worker results arrive.
- Far terrain replacement suppresses stale worker results and defers old-geometry disposal across frames.
- Biome-driven terrain generation.
- Snow, forest, plains, hills, beach, and dry areas.
- Natural reservoir water seeds ocean basins and inland depressions, then settles from those sources instead of filling a fixed height layer.
- Trees, flowers, tall grass, ores, and surface variation, with patch-based density masks that leave quieter land between feature clusters.
- Block breaking with crack animation.
- Block placement with placement preview.
- Held visuals for empty hands, tools, foods, loose materials, and many non-cube blocks.
- Wildlife with simple animal hit interactions and collision against loaded terrain blocks.
- Persistent modified chunks through IndexedDB.
- Modified chunk storage keys include a chunk storage version so generator-level visual changes do not reuse stale chunk meshes near spawn.
- Start-screen world tools can clear saved chunks, inventory, and legacy hotbar state for the selected seed.
- Persistent inventory and migrated legacy hotbar bindings.
- Slot-based inventory with stack limits, migration from older count-map saves, item categories, crafting, and a Minecraft-style hotbar backed by real inventory slots.
- Furnace interaction UI with per-block smelting queues, fuel consumption, ore-to-ingot processing, and output collection.
- Item pickup entities for mined block drops, with collection into available inventory slots.
- Mining drop rules and tool durability for pickaxes, including iron pickaxe progression and diamond harvest gating.
- Recipe cards show crafting outputs, ingredient requirements, and missing inputs.
- Sky, terrain atlas generation, terrain shader materials, far terrain, chunk streaming/world lifecycle, held-item rendering, diagnostics, persistence, inventory/crafting, HUD setup, seed utilities, player movement, block raycasting/interaction, and wildlife simulation now live outside `src/main.ts` under owned modules.
- F3 diagnostic overlay with frame, render, world, worker, chunk adoption/disposal, far-terrain rebuild/adoption/disposal, memory, and supported GPU timing counters.
- Day/night cycle with dynamic sun position, sky colors, terrain/water lighting, fog, and background transitions (~20 min real-time cycle).
- Hostile mobs include cave spiders underground plus zombies/skeletons on dark night surfaces; placed blocklight suppresses nearby spawns.
- Water rendering uses animated vertex waves, wave-derived specular normals, crest tinting, and foam.
- Runtime water flow now persists per-source remaining budgets, so mined-open reservoirs have bounded saved supply instead of an untracked infinite spread.

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
  - chunk streaming/world lifecycle. Done in `src/world/chunkWorldSystem.ts`.
- Add a debug/settings panel. Done for start-screen world save tools.
- Add a clear-world button for IndexedDB saves. Done for saved chunks, inventory, and legacy hotbar state.
- [x] Add render distance controls.
- [x] Add basic performance counters:
  - visible chunks
  - queued chunks
  - triangle count
  - worker queue length
  - frame timing and GPU timing where supported
- [x] Document persistence format in `docs/persistence-format.md`.

Exit criteria:

- Main app file keeps shrinking behind owned systems and stays under the ESLint line cap. Done for the current app entrypoint.
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
- [x] Add tool durability.
- [x] Add mining drop rules:
  - stone drops cobblestone
  - ores require pickaxes
  - better tools mine faster
- [x] Add a cleaner crafting UI.

Exit criteria:

- Inventory has real slots. Done.
- Items can be picked up from the world. Done for mined block drops.
- Tool use has durability and meaningful mining rules. Done for wood and stone pickaxes.
- Crafting clearly shows outputs and required inputs. Done.

### Milestone 3: Building Improvements

Goal: make building feel intentional and useful.

Tasks:

- [x] Add rotateable/variant blocks (log orientation).
- [x] Add better placement validation.
- [x] Add block preview using actual block material/texture.
- [x] Add glass placement.
- [x] Add chest block and small container UI.
- [x] Add creative/debug item grant controls for testing.
- [x] Add doors (two-tall openable, right-click toggle).
- [x] Add slabs/stairs (both done).
- [x] Add door open visual (thin panel).

Exit criteria:

- Building is predictable.
- Several crafted/placeable blocks have distinct purposes.
- [x] Container interaction exists.

### Milestone 4: Survival Lite

Goal: create a minimal progression loop beyond mining and placing.

Tasks:

- [x] Add furnace/smelting UI.
- [x] Smelt iron/copper/gold ore.
- [x] Add iron pickaxe.
- [x] Add health.
- [x] Add fall damage.
- [x] Add basic food items and eating.
- [x] Add sticks drop from leaves (~22%).
- [x] Add continuous mining (hold M1 chains into next block).
- [x] Add damage flash overlay on hit.
- [x] Add simple hostile or environmental threat later.
- [x] Add day/night cycle with dynamic sun position and lighting transitions.

Exit criteria:

- Player can progress from wood to stone to metal tools.
- Furnace has a working queue.
- Survival has at least one resource pressure.

### Milestone 5: World Systems

Goal: make exploration more rewarding.

Tasks:

- [x] Improve water rendering with wave-derived normals and specular highlights.
- Improve water rendering with a separated transparent/reflection pass if the current shader-only water becomes limiting.
- Add lakes and shoreline improvements.
- [x] Reduce terrain busyness with sparse surface detail masks, rarer rocks, restrained cave carving, and lower underground decoration density.
- [x] Add caves using 3D noise.
- [x] Add richer tree variants (oak, birch).
- [x] Add more surface features:
  - mushrooms
  - berry bushes
  - cactus
  - pumpkins
  - flowers (red, yellow, blue)
  - tall grass
- [x] Add surface rocks (cobblestone outcrops, weighted by biome).
- [x] Add biome transitions and local color variation.
- [x] Add lakes and shoreline improvements.
- [x] Add basic wildlife (deer, boar, birds).

Exit criteria:

- World has visible variety across biomes.
- Caves and ores create exploration goals.
- Terrain water comes from source reservoirs without generation-time fluid settling, and mined openings use source-connected flow with persisted bounded supply.

### Milestone 6: Rendering And Performance

Goal: improve visual quality without losing browser performance.

Tasks:

- [x] Restore ambient occlusion compatible with greedy meshing.
- [x] Add transparent-material separation for decorations/glass/water.
  - Four meshes per chunk: opaque (renderOrder 0), water (1, depthWrite false), solid transparent — glass + leaves (1, depthWrite true), decorations — plants + open doors (1, depthWrite false).
  - Glass and leaves excluded from greedy meshing; individual faces with proper tile mapping.
  - Decorations moved out of the opaque mesh into their own depthWrite=false mesh.
  - See `ChunkMeshPayload` for `transparent*` and `deco*` arrays, `src/mesh.ts` `emitTransparentFace` / `emitDecorations`, and `src/world/chunkWorldSystem.ts` mesh creation.
- Improve far terrain LOD blending.
- [x] Move far terrain rebuilds off the immediate chunk-boundary path with debounced, idempotent rebuild scheduling.
- [x] Keep far terrain generation worker-side and make main-thread replacement cheaper with stale-result suppression plus deferred geometry disposal.
- [x] Add chunk mesh memory accounting.
- [x] Add worker prioritization by camera direction.
- [x] Add optional lower render-distance profile.
- [x] Split production bundles so app/vendor chunks stay below the large-chunk warning threshold.
- Investigate WebGPU only after WebGL path is solid.

Exit criteria:

- Distant terrain remains stable.
- Chunk updates are smooth.
- Visual quality improves without large frame-time spikes.

## Near-Term Recommended Order

1. ✅ Add chest block and container UI.
2. ✅ Add basic food items and eating.
3. ✅ Add rotateable/variant blocks (log orientation).
4. ✅ Add doors (two-tall openable, right-click toggle).
5. ✅ Add slabs (half-height blocks, oak and cobblestone variants).
6. ✅ Add birch log orientation variants (BirchLogX/BirchLogZ).
7. ✅ Add sparse surface rocks (cobblestone outcrops, biome-weighted and patch-masked).
8. ✅ Add door open visual (thin panel rendering).
9. ✅ Add stairs (stepped blocks, directional placement).
10. ✅ Add hostile mobs (cave spiders).
11. ✅ Add leaf decay on log break.
12. ✅ Add shoreline improvements and inland lakes.
13. ✅ Add day/night cycle and light propagation.
14. Separate transparent render paths for glass/water.
15. ✅ Move far terrain rebuilds off chunk-boundary path.
16. ✅ Reduce far terrain replacement spikes with stale-result suppression and deferred geometry disposal.
17. ✅ Improve stair/slab movement with grounded half-block auto-step.
18. ✅ Make surface zombie/skeleton night spawning work with blocklight spawn suppression.
19. ✅ Improve water shader highlights with wave-derived normals.
20. ✅ Persist per-source water flow budgets.
21. ✅ Add 2-chunk Low render-distance profile.
22. ✅ Bias chunk request/adoption priority toward the camera direction.
23. ✅ Split Three.js vendor output into bounded production chunks.
24. ✅ Count all visible chunk mesh buffers in F3 memory diagnostics.
25. ✅ Restore greedy-mesh-compatible ambient occlusion.

## Current Priority

Remaining high-value work is now broader gameplay and polish:

- Improve far terrain LOD blending at the near/far transition.
- Add water recharge/evaporation loops on top of persisted source budgets.
- Add mechanism/redstone-style blocks once building depth becomes the priority.
- Continue shrinking top-level app orchestration out of `src/main.ts` when touching nearby systems.

## Known Risks

- `src/main.ts` still owns top-level app orchestration and scene setup, but is back under the lint line cap after moving console commands, death handling, start-screen handlers, touch setup, and frame audio into `src/game/*`.
- IndexedDB saves can obscure terrain-generation changes during testing.
- Block enum numeric IDs are persistence-sensitive.
- Greedy meshing plus transparent blocks needs careful material separation.
- Hotbar migration from older item-type shortcuts is best-effort; current hotbar state lives in inventory slots.
