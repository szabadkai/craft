import { isTouchDevice } from './touchControls';

export type PauseMenuCallbacks = {
  onResume: () => void;
  onSensitivityChange: (value: number) => void;
  onRenderDistanceChange: (value: number) => void;
  onSfxVolumeChange: (value: number) => void;
  onMusicVolumeChange: (value: number) => void;
  onSandboxChange: (checked: boolean) => void;
};

export class PauseMenu {
  private readonly overlayEl: HTMLDivElement;
  private readonly pauseBtnEl: HTMLButtonElement | null = null;
  readonly sensitivityInputEl: HTMLInputElement;
  readonly sensitivityValueEl: HTMLElement;
  readonly renderDistanceInputEl: HTMLInputElement;
  readonly renderDistanceValueEl: HTMLElement;
  readonly sfxVolumeInputEl: HTMLInputElement;
  readonly sfxVolumeValueEl: HTMLElement;
  readonly musicVolumeInputEl: HTMLInputElement;
  readonly musicVolumeValueEl: HTMLElement;
  readonly sandboxInputEl: HTMLInputElement;
  private _isOpen = false;

  get isOpen(): boolean {
    return this._isOpen;
  }

  constructor(
    private readonly callbacks: PauseMenuCallbacks,
    defaults: {
      sensitivityLabel: string;
      sensitivityValue: number;
      renderDistanceLabel: string;
      renderDistanceValue: number;
      sfxVolume: number;
      musicVolume: number;
      sandbox: boolean;
    },
  ) {
    this.overlayEl = document.createElement('div');
    this.overlayEl.className = 'pause-screen hidden';

    const isTouch = isTouchDevice();
    const controls = isTouch
      ? `
          <div class="pause-controls">
            <span>Left stick</span><span>Move</span>
            <span>Right area</span><span>Look</span>
            <span>Mine button</span><span>Break block</span>
            <span>Place button</span><span>Place block</span>
            <span>Jump button</span><span>Jump / Swim up</span>
            <span>Tap hotbar</span><span>Select slot</span>
          </div>`
      : `
          <div class="pause-controls">
            <span>W A S D</span><span>Move</span>
            <span>Mouse</span><span>Look</span>
            <span>Left click</span><span>Mine / Attack</span>
            <span>Right click</span><span>Place / Use</span>
            <span>Space</span><span>Jump / Swim up</span>
            <span>Shift</span><span>Sprint / Swim down</span>
            <span>E</span><span>Inventory</span>
            <span>1-9</span><span>Hotbar slot</span>
            <span>M</span><span>Mute audio</span>
            <span>F3</span><span>Diagnostics</span>
          </div>`;

    this.overlayEl.innerHTML = `
      <div class="start-window pause-window">
        <div class="start-head">
          <span class="start-kicker">Game paused</span>
          <h1>Settings</h1>
        </div>
        <label class="sensitivity-field" for="pause-sensitivity">
          <span>${isTouch ? 'Look sensitivity' : 'Mouse sensitivity'}</span>
          <output id="pause-sensitivity-value">${defaults.sensitivityLabel}</output>
          <input id="pause-sensitivity" type="range" min="0.25" max="6" step="0.05" value="${defaults.sensitivityValue}" />
        </label>
        <label class="sensitivity-field" for="pause-render-distance">
          <span>Render distance</span>
          <output id="pause-render-distance-value">${defaults.renderDistanceLabel}</output>
          <input id="pause-render-distance" type="range" min="2" max="12" step="2" value="${defaults.renderDistanceValue}" />
        </label>
        <label class="sensitivity-field" for="pause-sfx-volume">
          <span>Sound effects</span>
          <output id="pause-sfx-value">${defaults.sfxVolume}%</output>
          <input id="pause-sfx-volume" type="range" min="0" max="100" step="5" value="${defaults.sfxVolume}" />
        </label>
        <label class="sensitivity-field" for="pause-music-volume">
          <span>Music</span>
          <output id="pause-music-value">${defaults.musicVolume}%</output>
          <input id="pause-music-volume" type="range" min="0" max="100" step="5" value="${defaults.musicVolume}" />
        </label>
        <label class="sandbox-field" for="pause-sandbox">
          <input id="pause-sandbox" type="checkbox" ${defaults.sandbox ? 'checked' : ''} />
          <span>Sandbox mode</span>
          <span class="sandbox-hint">Disables hostile mobs</span>
        </label>
        <div class="pause-divider"></div>
        <div class="start-head">
          <span class="start-kicker">Controls</span>
        </div>
        ${controls}
        <div class="pause-actions">
          <button class="primary pause-resume" type="button">Resume</button>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlayEl);

    this.sensitivityInputEl = this.overlayEl.querySelector<HTMLInputElement>('#pause-sensitivity')!;
    this.sensitivityValueEl = this.overlayEl.querySelector<HTMLElement>('#pause-sensitivity-value')!;
    this.renderDistanceInputEl = this.overlayEl.querySelector<HTMLInputElement>('#pause-render-distance')!;
    this.renderDistanceValueEl = this.overlayEl.querySelector<HTMLElement>('#pause-render-distance-value')!;
    this.sfxVolumeInputEl = this.overlayEl.querySelector<HTMLInputElement>('#pause-sfx-volume')!;
    this.sfxVolumeValueEl = this.overlayEl.querySelector<HTMLElement>('#pause-sfx-value')!;
    this.musicVolumeInputEl = this.overlayEl.querySelector<HTMLInputElement>('#pause-music-volume')!;
    this.musicVolumeValueEl = this.overlayEl.querySelector<HTMLElement>('#pause-music-value')!;
    this.sandboxInputEl = this.overlayEl.querySelector<HTMLInputElement>('#pause-sandbox')!;

    this.overlayEl.querySelector('.pause-resume')!.addEventListener('click', () => this.close());
    this.overlayEl.addEventListener('click', (e) => {
      if (e.target === this.overlayEl) this.close();
    });

    this.sensitivityInputEl.addEventListener('input', () => {
      this.callbacks.onSensitivityChange(Number(this.sensitivityInputEl.value));
    });
    this.renderDistanceInputEl.addEventListener('input', () => {
      this.callbacks.onRenderDistanceChange(Number(this.renderDistanceInputEl.value));
    });
    this.sfxVolumeInputEl.addEventListener('input', () => {
      this.callbacks.onSfxVolumeChange(Number(this.sfxVolumeInputEl.value));
    });
    this.musicVolumeInputEl.addEventListener('input', () => {
      this.callbacks.onMusicVolumeChange(Number(this.musicVolumeInputEl.value));
    });
    this.sandboxInputEl.addEventListener('change', () => {
      this.callbacks.onSandboxChange(this.sandboxInputEl.checked);
    });

    if (isTouch) {
      const btn = document.createElement('button');
      btn.className = 'pause-btn hidden';
      btn.type = 'button';
      btn.innerHTML = '&#x2630;';
      btn.addEventListener('click', () => this.open());
      document.body.appendChild(btn);
      this.pauseBtnEl = btn;
    }
  }

  open(): void {
    if (this._isOpen) return;
    this._isOpen = true;
    this.overlayEl.classList.remove('hidden');
  }

  close(): void {
    if (!this._isOpen) return;
    this._isOpen = false;
    this.overlayEl.classList.add('hidden');
    this.callbacks.onResume();
  }

  toggle(): void {
    if (this._isOpen) this.close();
    else this.open();
  }

  showButton(): void {
    this.pauseBtnEl?.classList.remove('hidden');
  }

  hideButton(): void {
    this.pauseBtnEl?.classList.add('hidden');
  }
}
