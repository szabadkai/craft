# Persistence Format

Craft stores browser-local world state in IndexedDB database `craft-world-v1`.

## Object Stores

- `chunks`
  - Key: `<seed>:v<chunkStorageVersion>:<cx>,<cz>`
  - Value: copied `ArrayBuffer` for one chunk's `Uint16Array` block IDs.
  - Current chunk storage version: `4` in `src/persistence/worldStore.ts`.
  - Version bumps intentionally orphan older modified chunks so generator changes are not hidden by stale saved terrain.

- `state`
  - Key/value store for per-seed gameplay state.
  - Keys are namespaced by seed but are not chunk-versioned unless noted below.

## State Keys

- `inventory:<seed>`
  - Current value: `InventorySnapshot`.
  - Older count-map inventory saves are still accepted by `InventorySystem.applyInventory()`.

- `hotbar:<seed>`
  - Value: legacy `Item[]` hotbar shortcuts.
  - Current hotbar state is backed by inventory slots; this key exists for migration/backward compatibility.

- `furnaces:<seed>`
  - Value: `Record<string, FurnaceSnapshot>`.
  - Per-block furnace state keyed by world block position string.

- `chests:<seed>`
  - Value: `Record<string, ChestSnapshot>`.
  - Per-block chest inventory keyed by world block position string.

- `doors:<seed>`
  - Value: `Record<string, 'x' | 'z'>`.
  - Door orientation keyed by lower/upper door block position; `DoorSystem.remove()` clears both halves.

- `water-budgets:<seed>`
  - Value: `Record<string, number>`.
  - Key is source position string `x,y,z`; value is remaining source budget for newly created runtime water cells.
  - Water blocks themselves still live in chunk data. The budget record only tracks remaining future spread from source reservoirs/springs.

## Local Storage

- `craft-seed`
  - Last selected seed text.

- `craft-render-distance`
  - Detail radius preference.

- Mouse sensitivity, sandbox mode, audio volumes, and minimap waypoints also use local storage through their owning modules.

## Clear World Behavior

`WorldStore.clearCurrentWorld()` deletes:

- all chunk keys for the current seed and current chunk storage version,
- inventory/hotbar state,
- furnaces,
- chests,
- doors,
- water budgets.

It does not clear unrelated seeds or older chunk-storage-version keys.
