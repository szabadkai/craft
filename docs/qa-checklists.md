# QA Checklists

Use these lightweight manual checks before finishing changes that touch persistence, world reset, spawning, or core controls.

## Persistence-Sensitive Changes

Run this checklist when changing IndexedDB stores, localStorage keys, chunk storage version behavior, inventory snapshots, container state, doors, furnaces, chests, water budgets, or world reset tools.

- Start a world with a known seed.
- Place and break several blocks near spawn.
- Add inventory items, select multiple hotbar slots, and reload the page.
- Verify modified chunks, inventory contents, and selected hotbar slots persist.
- Place a furnace, chest, and door; change their state; reload the page.
- Verify furnace contents/progress state, chest contents, and door open/closed state persist.
- Open a path from a water reservoir, wait for runtime water spread, reload the page.
- Verify saved water blocks and source budgets behave consistently after reload.
- Use Clear saves on the start screen for the active seed.
- Verify chunks, inventory, hotbar state, furnaces, chests, doors, and water budgets are reset for that seed.
- Switch to a different seed and verify state does not leak between seeds.
- If terrain generation semantics changed, verify whether `CHUNK_STORAGE_VERSION` needs a bump and document it in `docs/persistence-format.md`.

## Hostile Spawn Changes

Run this checklist when changing hostile mob spawn selection, lighting checks, collision checks, or mob body dimensions.

- Test surface spawning at night away from placed light.
- Place torches or other blocklight near the player and verify nearby surface spawns are suppressed.
- Test cave spider spawning underground in naturally generated caves.
- Verify cave spawns do not appear inside solid blocks, ceilings, walls, water, doors, or decorations.
- Verify mobs spawn on solid loaded-world blocks, not inferred terrain height alone.
- Verify skeleton, zombie, and cave spider hitboxes match their visible body well enough for ray hits and collision.
- Verify F3/performance behavior remains stable with several mobs active.
