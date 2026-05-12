import { InventorySystem } from '../inventory/inventorySystem';
import { foodValueFor, Item } from '../inventory/items';
import { HealthSystem } from './health';

const EAT_DURATION_MS = 1600;

export class EatingSystem {
  private state: {
    item: Item;
    startedAt: number;
    healAmount: number;
  } | null = null;

  constructor(
    private readonly health: HealthSystem,
    private readonly inventory: InventorySystem,
    private readonly barEl: HTMLDivElement,
    private readonly barFillEl: HTMLDivElement,
  ) {}

  get isEating(): boolean {
    return this.state !== null;
  }

  /** Attempt to start eating the item in the selected hotbar slot. */
  tryStart(): boolean {
    if (this.state) return false;

    const slot = this.inventory.slotAt(this.inventory.selectedHotbarIndex);
    if (!slot) return false;

    const healAmount = foodValueFor(slot.item);
    if (healAmount <= 0) return false;

    // Don't eat if at full HP
    if (this.health.state.hp >= this.health.state.maxHp) return false;

    this.state = { item: slot.item, startedAt: performance.now(), healAmount };
    this.barEl.classList.remove('hidden');
    this.barFillEl.style.width = '0%';
    return true;
  }

  cancel(): void {
    this.state = null;
    this.barEl.classList.add('hidden');
    this.barFillEl.style.width = '0%';
  }

  tick(now: number): void {
    if (!this.state) return;

    // Cancel if inventory slot changed or item consumed externally
    const slot = this.inventory.slotAt(this.inventory.selectedHotbarIndex);
    if (!slot || slot.item !== this.state.item || slot.count <= 0) {
      this.cancel();
      return;
    }

    // Cancel if at full HP
    if (this.health.state.hp >= this.health.state.maxHp) {
      this.cancel();
      return;
    }

    const elapsed = now - this.state.startedAt;
    const progress = Math.min(1, elapsed / EAT_DURATION_MS);
    this.barFillEl.style.width = `${progress * 100}%`;

    if (progress >= 1) {
      this.health.heal(this.state.healAmount);
      this.inventory.consumeSelectedItem(1);
      this.cancel();
    }
  }
}
