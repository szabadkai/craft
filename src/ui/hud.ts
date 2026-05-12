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
  waterOverlayEl: HTMLDivElement;
};

export function createHud(defaultSeedText: string, defaultSensitivityLabel: string): HudElements {
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
    <div class="water-overlay"></div>
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
    waterOverlayEl: root.querySelector<HTMLDivElement>('.water-overlay')!,
  };
}
