# Craft Repo Context

This is a browser Minecraft-like voxel prototype built with Vite, TypeScript, and Three.js.

## Run Commands

- Install: `npm install`
- Dev server: `npm run dev -- --port 5174`
- Build check: `npm run build`

## Architecture

- `src/main.ts`
  Main app loop, Three.js scene composition, player/inventory/input orchestration, block interaction wiring, held item visuals.
- `vite.config.ts`
  Production build chunking. Three.js is split into bounded vendor chunks to keep app/vendor outputs below Vite's large-chunk warning threshold.
- `src/rendering/terrainMaterials.ts`
  Sky mesh, generated terrain atlas, and terrain shader material factory.
- `src/rendering/atmosphere.ts`
  Render-distance fog adjustments, cave factor estimation from overhead blocks, underwater/cave fog and background blending.
- `src/rendering/diagnostics.ts`
  F3 diagnostics collection, GPU timer handling, summary formatting, and overlay painting.
- `src/rendering/farTerrain.ts`
  Worker-backed far terrain heightfield ring ownership, per-vertex alpha LOD blending, stale-result suppression, mesh replacement, and budgeted old-geometry disposal.
- `src/rendering/dayNightCycle.ts`
  Day/night cycle: 24k-tick timer, sun position math, per-time-of-day color keyframe interpolation for sky/terrain/water shader uniforms, scene fog, background, and Three.js light colors and intensities.
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
  Loaded chunk ownership, worker-pool requests, camera-biased chunk prioritization, remeshing, chunk persistence saves, block access/mutation, spawn readiness, fade-in, and world diagnostics summary including all visible chunk mesh buffer bytes.
- `src/world/chunkMeshFactory.ts`
  Main-thread conversion of worker mesh payloads into Three.js chunk meshes.
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
  Greedy voxel meshing. Emits repeated atlas UVs, atlas rect attributes, per-vertex light values, and greedy-compatible ambient occlusion baked into vertex colors.
- `src/atlas.ts`
  Atlas tile IDs and tile rect mapping.
- `src/blocks.ts`
  Solid block registry and block colors.
- `src/types.ts`
  Core constants, block enum, worker message types.

## Current Features

- First-person movement and collision.
- Persistent mouse sensitivity control for pointer-lock camera movement.
- Persistent render-distance control includes a 2-chunk Low profile for weaker devices.
- Worker-pool generated chunks.
- Greedy meshing.
- Repeating texture atlas shader.
- Warm original-style sky, fog, water, atlas colors, and pixel hotbar styling.
- Day/night cycle with dynamic sun position, sky dome colors, terrain and water shader lighting, directional/ambient light colors and intensities, scene fog, and background — all transitioning smoothly over a ~20-minute real-time 24k-tick cycle.
- Biomes: plains, forest, hills, beach, snow, dry.
- Natural reservoir water seeds low ocean basins and inland depressions, then settles from those sources instead of filling a fixed world-height layer.
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
- Caves with restrained 3D-noise caverns, narrower worm tunnels, rarer surface entrances, and occasional large chambers.
- Place preview now uses the terrain atlas texture with per-face tile mapping so the ghost block matches the placed block's actual appearance.
- Console command system (`` ` `` key) with `give <item> [count]`, `items`, `help`, `clear`, tab completion.
- Wildlife with simple animal hit interactions and collision against loaded terrain blocks.
- Far terrain heightfield ring merged into a single mesh to keep draw calls low.
- F3 diagnostic overlay with FPS, frame timing, render stats, worker pressure, chunk adoption/deferred disposal timings, far-terrain rebuild/adoption/disposal timings, memory estimates, and GPU timing when supported.
- First-person held item view with proper scale (~75% larger), closer camera placement, empty-hand model, and distinct models for tools, foods, loose materials, and many non-cube blocks.
- Damage flash overlay (red screen vignette on hit).
- Continuous mining while holding mouse1 — chains into next block when current one breaks.
- Oak doors — two-tall openable blocks with right-click toggle, door state persistence, and planks-based recipe (6 planks → 3 doors).
- Oak and cobblestone stairs — stepped blocks with 4-directional placement based on player yaw, non-greedy mesh rendering, stepped collision, and player auto-step from the low side.
- Hostile mobs — cave spiders spawn in deep caves; zombies and skeletons spawn on dark night surfaces. They pursue the player, deal contact damage, and drop raw meat.
- Surface combat has differentiated hostile roles: zombies are tougher melee threats, skeletons keep range and fire bone projectiles, cave spiders stay fast cave melee. Mob hits add knockback and a brief scale/flash response. Drops support progression: zombies can drop raw meat and rare iron ingots, skeletons drop bones/coal, cave spiders drop string/raw meat.
- Leaf decay — breaking a log causes ~28% of nearby leaves to drop sticks/apples and disappear.
- Shoreline improvements — variable-width beaches (sand/grass mix at water line), inland lakes in terrain depressions, biome border blending.
- Separate transparent render paths — glass, leaves, and decorations render in dedicated transparent meshes with proper alpha blending and depth ordering.
- Water shader uses multi-frequency vertex waves, wave-derived normals for specular highlights, crest tinting/foam, and day/night-aware lighting/fog.

## Day/Night Cycle Architecture

- `src/rendering/dayNightCycle.ts` (`DayNightCycle` class) is the single source of truth for time-of-day.
- Time advances via `update(dt)` with `TICKS_PER_SECOND = 20` (24,000 ticks = 20 real minutes).
- Sun position: sinusoidal elevation (`sin(sunAngle) * π/2`) and linear azimuth (`sunAngle`). Rises in +X (east), zenith at tick 6000 (noon), sets in -X (west), nadir at tick 18000 (midnight).
- 12 color keyframe arrays (e.g., `SKY_TOP`, `FOG_COLOR`, `DIRECTIONAL_INTENSITY`) define the visual timeline. Interpolation is linear between stops.
- `applyToLights(hemi, sun, skyMat)` updates `HemisphereLight` color/intensity, `DirectionalLight` position/color/intensity, and sky shader `topColor`/`horizonColor`/`groundColor`/`sunColor`/`sunDirection` uniforms.
- `applyToTerrainMaterials(terrain, fade, water, transparent, deco)` updates `sunDirection` and `fogColor` on all five shared shader materials. Cloned fade materials lag by one frame (negligible during brief fade-in).
- `applyToScene(scene)` sets `scene.fog.color` and `scene.background` to the time-of-day colors. These serve as the baseline that `applyUnderwaterEffects` blends toward for underwater/cave overlays.
- `applyUnderwaterEffects` (`src/rendering/atmosphere.ts`) now accepts `airFogColor` and `airBgColor` parameters — the caller passes `dayNight.fogColor()` and `dayNight.backgroundColor()` so the water/cave blend always uses the current time-of-day colors as the "normal" baseline.

## Important Implementation Notes

- Block IDs in the `Block` enum must only be appended, not reordered, because saved chunks store numeric IDs.
- Chunk data is `Uint16Array`.
- World edits should go through `ChunkWorldSystem.setBlock(...)` so saves and remeshes stay coordinated.
- Furnace contents/progress are persisted separately from chunk block data, keyed by world seed and furnace block position.
- Main thread should not generate terrain meshes directly.
- Chunk generation and remeshing jobs are distributed across a small worker pool.
- Worker mesh results are adopted on the main thread with a small frame-time budget and camera-biased priority; old chunk geometry/material disposal is deferred across frames to reduce chunk pop-in stutter.
- Far terrain is generated in `src/farTerrainWorker.ts`; `FarTerrainSystem` discards stale worker results and disposes replaced geometry with a per-frame budget. It should stay merged into a small number of meshes; avoid reintroducing one mesh per far patch.
- Terrain shader expects:
  - `uv`: repeated local face UVs.
  - `atlasRect`: vec4 of atlas tile rect.
  - `color`: lighting and variation.
- Greedy terrain face merging includes tile, light, and four corner AO values in the mask key. Do not merge faces with different AO values or corner darkening will smear across block edges.
- Transparent plant blocks are decorations and should not be treated as solid raycast targets.
- Transparent rendering uses four meshes per chunk: opaque solids (`chunk.mesh`, renderOrder 0), water (`chunk.waterMesh`, renderOrder 1, depthWrite false), solid transparent — glass + leaves (`chunk.transparentMesh`, renderOrder 1, depthWrite true), and decorations — plants, open doors (`chunk.decoMesh`, renderOrder 1, depthWrite false). Glass and leaves are excluded from greedy meshing and emit individual block faces into `transparent*` arrays. Decorations emit X-shaped quads into `deco*` arrays. Both use the terrain atlas shader with `transparent: true`.
- Wildlife movement uses loaded chunk blocks for ground and obstacle collision; avoid falling back to generated height only for gameplay collision.
- Health state (`src/player/health.ts`) tracks HP, fall distance, death, and respawn. `reconcile()` handles per-frame fall damage and hearts DOM display. Hearts are 8×8 canvas-drawn pixel sprites (full red with white border, half, empty outline) rendered at 2× nearest-neighbour scale.
- Caves are generated in `src/terrain.ts` via `isCaveBlock`: 3D value noise caverns (scale 64), worm tunnels (crossed noise, narrow 0.51–0.58 band), surface entrances (scale 14, near-surface), and large chambers (scale 72).
- Oak doors use two block IDs (`OakDoor`=closed solid, `OakDoorOpen`=open non-solid) plus `DoorSystem` (`src/world/doorSystem.ts`) for orientation tracking. Open doors render as thin visible panels (0.08 thick quads) via `emitOpenDoorQuad` in `src/mesh.ts`.
- Birch logs have orientation variants (`BirchLogX`, `BirchLogZ`) matching the LogX/LogZ pattern. Placing birch logs rotates them based on clicked face. Natural birch trees still generate as plain `BirchLog` (vertical).
- Slab blocks use four block IDs per material pair: `OakSlab` (bottom half), `OakSlabTop` (top half), `CobblestoneSlab`, `CobblestoneSlabTop`. Slabs render as half-height individual geometry (non-greedy, like water faces) via `emitSlabFace` in `src/mesh.ts`. Collision is half-height AABB in `PlayerController.collides()`. Placement: top face → bottom slab, bottom face → top slab, side face → bottom slab. Crafted from 3 planks → 6 oak slabs, 3 cobblestone → 6 cobblestone slabs.
- Stair blocks use eight block IDs (4 directions × 2 materials): OakStairsN/S/E/W and CobblestoneStairsN/S/E/W. Stairs render individually (non-greedy) via `emitStairFaces` in `src/mesh.ts`. Collision is stepped: bottom half (full 1×1), upper half (half-block in stair direction). Direction is determined by player's yaw at placement time. Stair blocks are NOT in `solidBlocks` — they have custom collision checks in `PlayerController.collides()`. `PlayerController.tryAutoStep()` handles grounded horizontal movement up stairs/slabs by raising just over half a block and settling onto support. Crafted from 6 planks → 4 oak stairs, 6 cobblestone → 4 cobblestone stairs.
- Hostile mobs are managed by `HostileSystem` (`src/world/hostileMobs.ts`). Cave spiders spawn in caves when the player is deep underground (>8 blocks below surface); zombies/skeletons spawn on valid terrain surfaces at night. Spawn checks use static skylight for caves, time-of-day darkness for surface mobs, and blocklight to let torches suppress nearby spawns. Mobs walk toward the player within 18 blocks; zombies deal heavier melee contact, skeletons maintain range and shoot projectiles, and cave spiders are fast cave melee. Hit detection competes with wildlife/block raycasting (closest target wins). Drop tables live in `src/game/hostileDrops.ts`.
- Surface rocks generate in `addSurfaceDetails` in `src/terrain.ts` as sparse cobblestone outcrops. Rocks use a low-frequency patch mask plus 5x5 cell anchoring, so even rocky areas leave quiet ground between features. Surface grass, flowers, pumpkins, cactus, and dry gravel also use patch masks instead of independent per-block sprinkling. Open doors render as thin visible panels (0.08 thick quads) via `emitOpenDoorQuad` in `src/mesh.ts`. `DoorSystem.place()` places both halves, `toggle()` swaps between closed/open block IDs, `remove()` clears both halves. Persistence via `WorldStore.loadDoors/saveDoors` keyed by seed. Doors are placed two-tall; breaking either half removes both and drops one item.
- Place preview rebuilds the BoxGeometry UVs per selected block via `atlasBoxGeometry`, mapping each face to the correct atlas tile using `tileForBlockFace`.
- Block placement can replace water cells, making submerged/underground water sources pluggable with normal blocks. Terrain generation seeds finite reservoir water in `addOceanReservoirs`/`addLakes`, but does not run a generation-time settling simulation; full-block water creates visual columns/sheets when moved through carved terrain without level metadata. `OCEAN_SURFACE_Y` is a terrain/rendering target derived from `TERRAIN_BASE_ELEVATION`, not a global underground fill rule. Ocean reservoir columns are continuous for surface terrain at or below `OCEAN_SURFACE_Y` so shorelines remain attached to the waterbody. Runtime water flow is source-connected through `WaterSimSystem` after mining opens a path and consumes persistent per-source budget for newly created water cells.
- `WaterSimSystem` persists per-source remaining flow budgets through `WorldStore.loadWaterBudgets/saveWaterBudgets`. New water cells consume from the nearest source budget, valid sources slowly recharge depleted budgets, and disconnected runtime-spread water evaporates after a delay. Already-saved water blocks remain chunk data. Clear-world deletes water budgets with the other per-seed state.
- Console commands are defined in `src/ui/console.ts`. The `give` command resolves item IDs via `itemDefs` fuzzy matching.
- Existing IndexedDB saves can make old chunks appear near spawn after generator changes.
- Chunk storage version is bumped after major generator density changes so saved terrain does not mask the new quieter generation.
- ESLint enforces a 650 effective-line cap for TypeScript files. Run `npm run lint` regularly during refactors and split modules along durable system boundaries before files approach the cap.
- Refactors should prefer hierarchical ownership such as `rendering/*`, `world/*`, `inventory/*`, or `player/*`; avoid scattering small lateral helper files without a clear parent system.

## Documentation Maintenance

- Keep `AGENTS.md` and `docs/project-plan.md` up to date when changing architecture, persistence formats, major systems, current features, roadmap priorities, or known risks.
- Keep `docs/persistence-format.md` up to date when changing IndexedDB stores, key formats, chunk storage version semantics, or localStorage keys.
- When completing a milestone or adding a substantial feature, update the "Current Features", "Good Next Tasks", and project roadmap as needed.
- If implementation details change in a way future agents must know, document them here before finishing the task.

## Known Bugs / UX Issues

- Hostile mob cave spawns may sometimes appear inside solid blocks briefly before resolving.


## Good Next Tasks

- Tune water recharge/evaporation feel after playtesting.
- Add restone/mechanism blocks for more complex building.
