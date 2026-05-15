import { Block, WORLD_HEIGHT } from '../types';

export type DoorOrientation = 'x' | 'z';

type DoorData = {
  orientation: DoorOrientation;
};

export type BlockEntry = { wx: number; y: number; wz: number; block: Block };

/**
 * Tracks door orientation state per position.
 * Open/closed state is encoded in the block ID (OakDoor = closed, OakDoorOpen = open).
 * Block mutations use batch setBlocks() so both halves of a door update atomically
 * (single remesh per chunk capturing both blocks).
 */
export class DoorSystem {
  private readonly doors = new Map<string, DoorData>();

  private static key(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  getOrientation(wx: number, wy: number, wz: number): DoorOrientation {
    return this.doors.get(DoorSystem.key(wx, wy, wz))?.orientation ?? 'x';
  }

  /**
   * Place a door at the given position.
   * Places both the bottom and top blocks atomically via a single setBlocks call.
   */
  place(
    wx: number, wy: number, wz: number,
    orientation: DoorOrientation,
    setBlocks: (entries: BlockEntry[]) => void,
  ): void {
    const bottomKey = DoorSystem.key(wx, wy, wz);
    const topKey = DoorSystem.key(wx, wy + 1, wz);
    this.doors.set(bottomKey, { orientation });
    this.doors.set(topKey, { orientation });
    setBlocks([
      { wx, y: wy, wz, block: Block.OakDoor },
      { wx, y: wy + 1, wz, block: Block.OakDoor },
    ]);
  }

  /**
   * Toggle door open/closed at the given position.
   * Searches upward and downward from the hit position to find both door halves.
   */
  toggle(
    wx: number, wy: number, wz: number,
    getBlock: (wx: number, y: number, wz: number) => Block,
    setBlocks: (entries: BlockEntry[]) => void,
  ): void {
    // Find all connected door blocks by scanning upward and downward
    const isDoor = (b: Block) => b === Block.OakDoor || b === Block.OakDoorOpen;
    let lowest = wy;
    let highest = wy;
    while (lowest > 0 && isDoor(getBlock(wx, lowest - 1, wz))) lowest--;
    while (highest < WORLD_HEIGHT - 1 && isDoor(getBlock(wx, highest + 1, wz))) highest++;

    const entries: BlockEntry[] = [];
    for (let y = lowest; y <= highest; y++) {
      const block = getBlock(wx, y, wz);
      const newBlock = block === Block.OakDoor ? Block.OakDoorOpen : Block.OakDoor;
      entries.push({ wx, y, wz, block: newBlock });
    }
    if (entries.length > 0) setBlocks(entries);
  }

  /**
   * Remove door data at the given position (and the half above/below if applicable).
   * Clears both halves atomically so remesh captures the full air state.
   */
  remove(
    wx: number, wy: number, wz: number,
    getBlock: (wx: number, y: number, wz: number) => Block,
    setBlocks: (entries: BlockEntry[]) => void,
  ): void {
    // Find all connected door blocks
    const isDoor = (b: Block) => b === Block.OakDoor || b === Block.OakDoorOpen;
    let lowest = wy;
    let highest = wy;
    while (isDoor(getBlock(wx, lowest - 1, wz))) lowest--;
    while (isDoor(getBlock(wx, highest + 1, wz))) highest++;

    const entries: BlockEntry[] = [];
    for (let y = lowest; y <= highest; y++) {
      this.doors.delete(DoorSystem.key(wx, y, wz));
      entries.push({ wx, y, wz, block: Block.Air });
    }
    if (entries.length > 0) setBlocks(entries);
  }

  isOpen(wx: number, wy: number, wz: number, getBlock: (wx: number, y: number, wz: number) => Block): boolean {
    return getBlock(wx, wy, wz) === Block.OakDoorOpen;
  }

  snapshot(): Record<string, DoorOrientation> {
    const data: Record<string, DoorOrientation> = {};
    for (const [key, value] of this.doors) {
      data[key] = value.orientation;
    }
    return data;
  }

  load(data: Record<string, DoorOrientation> | null): void {
    this.doors.clear();
    if (!data) return;
    for (const [key, orientation] of Object.entries(data)) {
      this.doors.set(key, { orientation });
    }
  }

  clear(): void {
    this.doors.clear();
  }
}
