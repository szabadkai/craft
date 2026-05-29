# Craft Tasklist

This is the working tasklist for forward development. `docs/project-plan.md` remains the historical roadmap and milestone record; this file tracks current and upcoming implementation work.

## Planning Rules

- Keep tasks small enough to complete and verify in one focused change.
- Prefer vertical slices that can be playtested over broad refactors.
- Update `AGENTS.md`, `docs/project-plan.md`, and `docs/persistence-format.md` when a task changes architecture, player-facing features, persistence, or known risks.
- Run `npm run build` after meaningful implementation changes.
- Run `npm run lint` when touching TypeScript refactors or files near the line cap.
- Keep TypeScript files under the ESLint 650 effective-line cap.
- Preserve block enum numeric stability: append new `Block` values only.

## Priority Order

1. Mobile and control polish.
2. Bug fixes that affect core playability.
3. Survival loop depth.
4. Exploration rewards.
5. Building/mechanism depth.
6. Ongoing technical debt and performance guardrails.

## Milestone 7: Control And UX Polish

Goal: make the game feel reliable on desktop and mobile before adding larger systems.

### Mobile Touch Playtest Pass

- [ ] Test on at least one real phone browser.
- [ ] Test on at least one tablet-sized viewport or physical tablet.
- [ ] Verify fixed movement stick does not steal world tap gestures outside its visual bounds.
- [ ] Verify right-side jump, run-lock, and crouch controls are reachable in portrait-like and landscape-like sizes.
- [ ] Verify hotbar item selection never triggers world place/use.
- [ ] Verify world tap places/uses the tapped target, not only the center crosshair.
- [ ] Verify world press-and-hold mines the tapped target and stops on touch release/cancel.
- [ ] Verify dragging to look does not accidentally place or mine.
- [ ] Verify eating via touch still works when holding a food item.
- [ ] Verify chest, furnace, door, and spawner interactions work through touch tap.

Acceptance criteria:

- No mine/place buttons are visible on mobile.
- A new player can move, jump, sprint, crouch, mine, place, eat, and open containers using touch only.
- Touch gestures do not interfere with inventory, chest, furnace, console, pause, or hotbar UI.

### Touch Settings

- [ ] Add persistent touch sensitivity separate from mouse sensitivity if playtesting shows the current shared sensitivity is poor.
- [x] Add button scale setting for mobile controls.
- [x] Add button opacity setting if controls obscure too much of the scene.
- [ ] Consider a left-handed mode only after the base layout is proven.

Acceptance criteria:

- Settings persist across reloads.
- Defaults remain playable without configuration.
- Settings UI does not clutter desktop controls.

### Desktop Input Regression Pass

- [ ] Verify pointer-lock mouse look still works.
- [ ] Verify left mouse mining still chains into the next center-targeted block.
- [ ] Verify right mouse place/use/eat behavior is unchanged.
- [ ] Verify keyboard sprint and crouch semantics after `ControlLeft` crouch support.
- [ ] Verify escape/pause/inventory still stops mining/eating.

Acceptance criteria:

- Desktop controls behave as before except for intentional crouch improvements.

### Known Control Follow-Ups

- [ ] Decide whether mobile touch mining should chain to adjacent tapped-ray blocks or remain single-block per hold.
- [ ] Decide whether split-control crosshair mode should be an optional mobile setting later.
- [x] Add visual active states for touch jump/run/crouch if playtesting shows the current feedback is too subtle.

## Milestone 8: Bug Fixes And Core Playability

Goal: remove issues that can break trust in the core survival loop.

### Hostile Spawn Reliability

- [ ] Reproduce hostile cave spawns briefly appearing inside solid blocks.
- [ ] Add stricter spawn volume checks for cave spiders, zombies, and skeletons.
- [ ] Verify spawn ground and headroom using loaded chunk data only.
- [ ] Add a small post-spawn validation or relocation pass if needed.
- [ ] Ensure blocklight and skylight suppression still work after changes.

Acceptance criteria:

- Hostile mobs no longer visibly spawn inside solid blocks during normal play.
- Spawn checks do not fall back to generated height for gameplay collision.

### Water Simulation Tuning

- [ ] Playtest mined-open reservoirs in caves, slopes, and shorelines.
- [ ] Tune source budget size.
- [ ] Tune recharge rate.
- [ ] Tune disconnected runtime-water evaporation delay.
- [ ] Verify saved runtime water and water budgets reload coherently.
- [ ] Document any persistence-format changes if budget snapshot shape changes.

Acceptance criteria:

- Water feels bounded rather than infinite.
- Plugging leaks and reopening paths behaves predictably.
- Reloading a world does not create obvious water duplication or disappearance surprises.

### Save And Reset Reliability

- [ ] Verify clear-world deletes chunks, inventory, hotbar migration state, doors, furnaces, chests, and water budgets.
- [ ] Verify changing seeds does not leak state from another seed.
- [ ] Verify old saves still migrate inventory/hotbar correctly.
- [ ] Add a manual QA checklist for persistence-sensitive changes.

Acceptance criteria:

- Start-screen world tools reliably reset per-seed state.
- Existing saves remain usable unless a documented storage version bump intentionally invalidates terrain chunks.

## Milestone 9: Survival Loop Depth

Goal: give players more reasons to gather, cook, fight, and prepare.

### Food And Recovery

- [ ] Decide whether to add hunger, stamina, or keep direct HP-healing food.
- [ ] If adding hunger, define the simplest persistence state and HUD representation.
- [ ] Add clearer food tiers: apple, raw meat, cooked meat, and future crops.
- [ ] Tune healing values and eating duration.
- [ ] Ensure mobile touch eating remains ergonomic.

Acceptance criteria:

- Food choices matter without making early play tedious.
- The system is understandable from item behavior and HUD feedback.

### Simple Farming

- [ ] Add seed item source, likely grass or chest loot.
- [ ] Add tilled soil or a simple plantable crop block.
- [ ] Add crop growth timing.
- [ ] Add harvest drops.
- [ ] Persist crop state through chunk block data or a documented per-seed store.

Acceptance criteria:

- Player can produce a basic renewable food source.
- Growth does not require high-frequency simulation across unloaded chunks unless intentionally designed.

### Combat Progression

- [ ] Add armor or a simpler defensive item if combat feels too punishing.
- [ ] Add clearer weapon/tool damage differences.
- [ ] Tune zombie, skeleton, and cave spider damage/health after playtesting.
- [ ] Improve projectile readability for skeleton arrows/bones.
- [ ] Consider rare drops that reinforce progression without replacing mining.

Acceptance criteria:

- Night and caves are threatening but recoverable.
- Iron-tier progression has value beyond diamond mining.

### Death And Recovery

- [ ] Decide whether items drop on death.
- [ ] If item drops are added, implement a recoverable death pile or dropped inventory stack.
- [ ] Add clear respawn state handling for active mobs/projectiles near the player.
- [ ] Verify death UI and respawn work on mobile touch.

Acceptance criteria:

- Death has consequences but does not destroy the run without warning.

## Milestone 10: Exploration Rewards

Goal: make exploration produce memorable discoveries and useful resources.

### Structures

- [ ] Add a small structure generation framework under `src/terrain/` or `src/world/` with clear ownership.
- [ ] Start with one low-risk structure: surface ruin, camp, or small dungeon room.
- [ ] Place structures using deterministic seed-based anchors.
- [ ] Avoid generating structures in water or impossible terrain until rules are explicit.
- [ ] Ensure structure blocks fit chunk generation and remeshing constraints.

Acceptance criteria:

- Structures are deterministic per seed.
- They do not require main-thread terrain generation.
- They are sparse enough to feel discovered rather than noisy.

### Loot Tables

- [ ] Move structure/chest loot toward data-driven tables if current hard-coded loot becomes limiting.
- [ ] Add biome or structure-specific loot.
- [ ] Keep powerful items rare enough to preserve progression.
- [ ] Include building/decorative rewards, not only combat resources.

Acceptance criteria:

- Loot creates exploration incentives without bypassing the core mining/crafting loop.

### Cave Rewards And Hazards

- [ ] Add one cave-specific reward beyond ores.
- [ ] Add one cave-specific hazard or landmark.
- [ ] Verify cave spider spawning remains fair after changes.
- [ ] Tune cave density only with chunk storage version implications in mind.

Acceptance criteria:

- Caves have reasons to explore besides ore density.
- New hazards are readable and avoid unavoidable damage.

## Milestone 11: Building And Mechanism Depth

Goal: expand building interaction after the survival and exploration loops have enough foundation.

### Mechanism Scope Decision

- [ ] Decide the target complexity: redstone-inspired lite system, not full Minecraft redstone.
- [ ] Define power sources: lever, button, pressure plate.
- [ ] Define powered blocks: lamp, door toggle, maybe simple piston later.
- [ ] Define update model and persistence before adding block IDs.
- [ ] Document mechanism constraints in `AGENTS.md`.

Acceptance criteria:

- Mechanisms have a small, testable ruleset before implementation starts.
- The design avoids broad world-update scans.

### First Mechanism Slice

- [ ] Add one power source block.
- [ ] Add one powered output block.
- [ ] Add block interaction behavior.
- [ ] Add rendering/atlas entries.
- [ ] Add item definitions and recipes.
- [ ] Add persistence behavior if block state is separate from block ID.

Acceptance criteria:

- Player can craft, place, toggle, save, reload, and observe one working mechanism.

### Building Block Expansion

- [ ] Add a small set of high-value decorative blocks only after inventory/category UI remains usable.
- [ ] Prefer blocks that reuse existing rendering paths.
- [ ] Add recipes and held-item visuals for each new block.
- [ ] Avoid adding many block IDs without gameplay or building value.

Acceptance criteria:

- New blocks improve building variety without bloating systems.

## Ongoing Technical Track

Goal: preserve performance and maintainability as features grow.

### `src/main.ts` Ownership Reduction

- [ ] Move scene/bootstrap setup into an owned rendering/app module when touching nearby code.
- [ ] Move top-level world lifecycle orchestration into a game/world coordinator if it becomes noisy again.
- [ ] Keep cross-system wiring explicit and avoid hidden global state.

Acceptance criteria:

- `src/main.ts` remains a readable composition root.
- New systems have clear parent modules.

### File Size And Module Boundaries

- [ ] Run `npm run lint` before finishing refactors.
- [ ] Split files before they approach the 650 effective-line cap.
- [ ] Prefer durable ownership folders: `rendering/*`, `world/*`, `inventory/*`, `player/*`, `game/*`, `ui/*`.
- [ ] Avoid scattering tiny lateral helpers without a parent system.

Acceptance criteria:

- No TypeScript file exceeds the line cap.
- New helpers are easy to find from their owning system.

### Performance Guardrails

- [ ] Keep chunk generation and remeshing worker-side.
- [ ] Keep far terrain merged into a small number of meshes.
- [ ] Avoid one-mesh-per-feature approaches for large world systems.
- [ ] Watch F3 diagnostics after terrain, mesh, water, mob, or structure changes.
- [ ] Check production bundle chunk sizes after dependency or rendering changes.

Acceptance criteria:

- Visual and gameplay additions do not introduce obvious chunk stutter or large draw-call spikes.

### Documentation Hygiene

- [ ] Update `AGENTS.md` when adding architecture or implementation notes future agents need.
- [ ] Update `docs/project-plan.md` when finishing milestones or changing roadmap priorities.
- [ ] Update `docs/persistence-format.md` when changing IndexedDB stores, keys, snapshot shapes, or storage-version semantics.
- [ ] Keep this `TASKLIST.md` focused on actionable future work.

Acceptance criteria:

- The docs accurately explain what exists, what changed, and what to do next.

## Backlog Ideas

- [ ] Optional split-control crosshair mobile mode.
- [ ] Touch control customization editor.
- [ ] Better onboarding/start hints.
- [ ] More wildlife behaviors.
- [ ] Ambient biome-specific sound layers.
- [ ] Weather, only after performance headroom is clear.
- [ ] WebGPU investigation, only after WebGL path is solid and stable.
