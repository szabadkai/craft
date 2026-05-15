export type HudElements = {
  root: HTMLDivElement;
  panelEl: HTMLDivElement;
  statsEl: HTMLDivElement;
  diagnosticsEl: HTMLDivElement;
  hotbarEl: HTMLDivElement;
  inventoryEl: HTMLDivElement;
  recipesEl: HTMLDivElement;
  inventoryOverlayEl: HTMLDivElement;
  inventoryTabsEl: HTMLDivElement;
  inventoryGridLargeEl: HTMLDivElement;
  heartsEl: HTMLElement;
  furnaceOverlayEl: HTMLDivElement;
  furnaceInputEl: HTMLButtonElement;
  furnaceFuelEl: HTMLButtonElement;
  furnaceOutputEl: HTMLButtonElement;
  furnaceInventoryEl: HTMLDivElement;
  furnaceBurnFillEl: HTMLSpanElement;
  furnaceProgressFillEl: HTMLSpanElement;
  furnaceStatusEl: HTMLSpanElement;
  chestOverlayEl: HTMLDivElement;
  chestGridEl: HTMLDivElement;
  chestInventoryEl: HTMLDivElement;
  startScreenEl: HTMLDivElement;
  loadingScreenEl: HTMLDivElement;
  loadingStatusEl: HTMLSpanElement;
  seedInputEl: HTMLInputElement;
  startFormEl: HTMLFormElement;
  randomSeedEl: HTMLButtonElement;
  seedPreviewEl: HTMLElement;
  clearWorldEl: HTMLButtonElement;
  clearWorldStatusEl: HTMLSpanElement;
  sensitivityInputEl: HTMLInputElement;
  sensitivityValueEl: HTMLElement;
  renderDistanceInputEl: HTMLInputElement;
  renderDistanceValueEl: HTMLElement;
  sfxVolumeInputEl: HTMLInputElement;
  sfxVolumeValueEl: HTMLElement;
  musicVolumeInputEl: HTMLInputElement;
  musicVolumeValueEl: HTMLElement;
  waterOverlayEl: HTMLDivElement;
  damageOverlayEl: HTMLDivElement;
  eatingBarEl: HTMLDivElement;
  eatingBarFillEl: HTMLDivElement;
};

export function createHud(
  defaultSeedText: string,
  defaultSensitivityLabel: string,
  defaultRenderDistanceLabel: string,
): HudElements {
  const root = document.createElement('div');
  root.className = 'hud';
  root.innerHTML = `
    <div class="start-screen">
      <form class="start-window">
        <div class="start-head">
          <span class="start-kicker">New world</span>
          <h1>Create World</h1>
        </div>
        <label class="seed-field" for="seed-input">
          <span>Seed</span>
          <input id="seed-input" autocomplete="off" spellcheck="false" />
        </label>
        <div class="seed-meta">
          <span>World key</span>
          <b id="seed-preview"></b>
        </div>
        <label class="sensitivity-field" for="sensitivity-input">
          <span>Mouse sensitivity</span>
          <output id="sensitivity-value" for="sensitivity-input">${defaultSensitivityLabel}</output>
          <input
            id="sensitivity-input"
            type="range"
            min="0.25"
            max="6"
            step="0.05"
            value="1"
          />
        </label>
        <label class="sensitivity-field" for="render-distance-input">
          <span>Render distance</span>
          <output id="render-distance-value" for="render-distance-input">${defaultRenderDistanceLabel}</output>
          <input
            id="render-distance-input"
            type="range"
            min="4"
            max="12"
            step="2"
            value="8"
          />
        </label>
        <label class="sensitivity-field" for="sfx-volume-input">
          <span>Sound effects</span>
          <output id="sfx-volume-value" for="sfx-volume-input">100%</output>
          <input
            id="sfx-volume-input"
            type="range"
            min="0"
            max="100"
            step="5"
            value="100"
          />
        </label>
        <label class="sensitivity-field" for="music-volume-input">
          <span>Music</span>
          <output id="music-volume-value" for="music-volume-input">50%</output>
          <input
            id="music-volume-input"
            type="range"
            min="0"
            max="100"
            step="5"
            value="50"
          />
        </label>
        <div class="seed-presets" aria-label="Seed presets">
          <button type="button" data-seed-preset="4">Spawn</button>
          <button type="button" data-seed-preset="30">Forest</button>
          <button type="button" data-seed-preset="cold copper">Snow</button>
        </div>
        <div class="seed-actions">
          <button class="secondary" type="button" id="random-seed">Randomize</button>
          <button class="primary" type="submit">Generate</button>
        </div>
        <div class="world-tools">
          <div>
            <b>World tools</b>
            <span id="clear-world-status">Clear saved chunks and inventory for this seed.</span>
          </div>
          <button type="button" id="clear-world">Clear saves</button>
        </div>
      </form>
    </div>
    <div class="loading-screen hidden">
      <div class="loading-window">
        <b>Generating world</b>
        <span id="loading-status">Preparing spawn chunks...</span>
        <div class="loading-bar"><span></span></div>
      </div>
    </div>
    <div class="crosshair"></div>
    <div class="hearts"></div>
    <div class="panel">
      <b>Craft</b>
      <span>Click to play. E inventory. F3 diagnostics.</span>
      <div id="stats"></div>
    </div>
    <div class="diagnostics hidden" id="diagnostics"></div>
    <div class="hotbar"></div>
    <div class="inventory-overlay hidden">
      <div class="inventory-window">
        <div class="inventory-head">
          <b>Inventory</b>
          <span>Click an item to assign it to the selected hotbar slot.</span>
        </div>
        <div class="inventory-tabs"></div>
        <div class="inventory-grid-large"></div>
        <div class="inventory-crafting">
          <b>Crafting</b>
          <div class="inventory"></div>
          <div class="recipes"></div>
        </div>
      </div>
    </div>
    <div class="furnace-overlay hidden">
      <div class="furnace-window">
        <div class="inventory-head">
          <b>Furnace</b>
          <span id="furnace-status">Add ore and fuel.</span>
        </div>
        <div class="furnace-top">
          <button type="button" class="furnace-slot" data-furnace-slot="input" title="Input"></button>
          <div class="furnace-meter burn"><span></span></div>
          <button type="button" class="furnace-slot" data-furnace-slot="fuel" title="Fuel"></button>
          <div class="furnace-meter progress"><span></span></div>
          <button type="button" class="furnace-slot" data-furnace-slot="output" title="Output"></button>
        </div>
        <div class="inventory-crafting furnace-storage">
          <b>Inventory</b>
          <div class="furnace-inventory"></div>
        </div>
      </div>
    </div>
    <div class="water-overlay"></div>
    <div class="damage-overlay"></div>
    <div class="eating-bar hidden">
      <div class="eating-bar-fill"></div>
    </div>
    <div class="chest-overlay hidden">
      <div class="chest-window">
        <div class="inventory-head">
          <b>Chest</b>
          <span>Click to transfer items.</span>
        </div>
        <div class="chest-grid"></div>
        <div class="chest-inventory"></div>
      </div>
    </div>
  `;
  document.body.appendChild(root);
  const seedInputEl = root.querySelector<HTMLInputElement>('#seed-input')!;
  seedInputEl.value = defaultSeedText;
  const sensitivityInputEl = root.querySelector<HTMLInputElement>('#sensitivity-input')!;

  return {
    root,
    panelEl: root.querySelector<HTMLDivElement>('.panel')!,
    statsEl: root.querySelector<HTMLDivElement>('#stats')!,
    diagnosticsEl: root.querySelector<HTMLDivElement>('#diagnostics')!,
    hotbarEl: root.querySelector<HTMLDivElement>('.hotbar')!,
    inventoryEl: root.querySelector<HTMLDivElement>('.inventory')!,
    recipesEl: root.querySelector<HTMLDivElement>('.recipes')!,
    inventoryOverlayEl: root.querySelector<HTMLDivElement>('.inventory-overlay')!,
    inventoryTabsEl: root.querySelector<HTMLDivElement>('.inventory-tabs')!,
    inventoryGridLargeEl: root.querySelector<HTMLDivElement>('.inventory-grid-large')!,
    heartsEl: root.querySelector<HTMLElement>('.hearts')!,
    furnaceOverlayEl: root.querySelector<HTMLDivElement>('.furnace-overlay')!,
    furnaceInputEl: root.querySelector<HTMLButtonElement>('[data-furnace-slot="input"]')!,
    furnaceFuelEl: root.querySelector<HTMLButtonElement>('[data-furnace-slot="fuel"]')!,
    furnaceOutputEl: root.querySelector<HTMLButtonElement>('[data-furnace-slot="output"]')!,
    furnaceInventoryEl: root.querySelector<HTMLDivElement>('.furnace-inventory')!,
    furnaceBurnFillEl: root.querySelector<HTMLSpanElement>('.furnace-meter.burn span')!,
    furnaceProgressFillEl: root.querySelector<HTMLSpanElement>('.furnace-meter.progress span')!,
    furnaceStatusEl: root.querySelector<HTMLSpanElement>('#furnace-status')!,
    chestOverlayEl: root.querySelector<HTMLDivElement>('.chest-overlay')!,
    chestGridEl: root.querySelector<HTMLDivElement>('.chest-grid')!,
    chestInventoryEl: root.querySelector<HTMLDivElement>('.chest-inventory')!,
    startScreenEl: root.querySelector<HTMLDivElement>('.start-screen')!,
    loadingScreenEl: root.querySelector<HTMLDivElement>('.loading-screen')!,
    loadingStatusEl: root.querySelector<HTMLSpanElement>('#loading-status')!,
    seedInputEl,
    startFormEl: root.querySelector<HTMLFormElement>('.start-window')!,
    randomSeedEl: root.querySelector<HTMLButtonElement>('#random-seed')!,
    seedPreviewEl: root.querySelector<HTMLElement>('#seed-preview')!,
    clearWorldEl: root.querySelector<HTMLButtonElement>('#clear-world')!,
    clearWorldStatusEl: root.querySelector<HTMLSpanElement>('#clear-world-status')!,
    sensitivityInputEl,
    sensitivityValueEl: root.querySelector<HTMLElement>('#sensitivity-value')!,
    renderDistanceInputEl: root.querySelector<HTMLInputElement>('#render-distance-input')!,
    renderDistanceValueEl: root.querySelector<HTMLElement>('#render-distance-value')!,
    sfxVolumeInputEl: root.querySelector<HTMLInputElement>('#sfx-volume-input')!,
    sfxVolumeValueEl: root.querySelector<HTMLElement>('#sfx-volume-value')!,
    musicVolumeInputEl: root.querySelector<HTMLInputElement>('#music-volume-input')!,
    musicVolumeValueEl: root.querySelector<HTMLElement>('#music-volume-value')!,
    waterOverlayEl: root.querySelector<HTMLDivElement>('.water-overlay')!,
    damageOverlayEl: root.querySelector<HTMLDivElement>('.damage-overlay')!,
    eatingBarEl: root.querySelector<HTMLDivElement>('.eating-bar')!,
    eatingBarFillEl: root.querySelector<HTMLDivElement>('.eating-bar-fill')!,
  };
}
