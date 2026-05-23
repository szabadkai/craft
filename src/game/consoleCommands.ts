import type { PlayerState } from '../player/playerController';
import { ConsoleCommand, defaultConsoleCommands } from '../ui/console';
import type { InventorySystem } from '../inventory/inventorySystem';
import { itemDefs } from '../inventory/items';
import type { MinimapSystem } from '../ui/minimap';

export function createConsoleCommands(
  inventorySystem: InventorySystem,
  minimap: MinimapSystem,
  player: PlayerState,
): ConsoleCommand[] {
  return [
    ...defaultConsoleCommands((item, count) => {
      const lower = item.toLowerCase();
      return inventorySystem.addItem(
        (itemDefs.find((d) => d.id === lower)?.id ?? itemDefs.find((d) => d.id.includes(lower))?.id)!,
        count,
      );
    }),
    {
      name: 'waypoint',
      description: 'waypoint set <name> | list | remove <name> - Manage map waypoints',
      execute: (args) => {
        const sub = args[0]?.toLowerCase();
        if (sub === 'set') {
          const name = args.slice(1).join(' ').trim();
          if (!name) return 'Usage: waypoint set <name>';
          const wp = minimap.addWaypoint(name, player.position.x, player.position.z);
          return `Waypoint "${wp.name}" set at ${wp.x}, ${wp.z}`;
        }
        if (sub === 'list') {
          const wps = minimap.getWaypoints();
          if (wps.length === 0) return 'No waypoints set.';
          return wps.map((w) => `${w.name} (${w.x}, ${w.z})`).join('\n');
        }
        if (sub === 'remove' || sub === 'rm') {
          const name = args.slice(1).join(' ').trim();
          if (!name) return 'Usage: waypoint remove <name>';
          return minimap.removeWaypoint(name) ? `Removed "${name}"` : `Waypoint "${name}" not found`;
        }
        return 'Usage: waypoint set <name> | list | remove <name>';
      },
    },
  ];
}
