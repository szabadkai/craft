import * as THREE from 'three';
import {
  clampMouseSensitivity,
  formatMouseSensitivity,
  saveMouseSensitivity,
} from '../player/mouseSensitivity';
import {
  clampDetailRadius,
  formatRenderDistance,
  getDetailRadius,
  setDetailRadius,
} from '../player/renderDistance';
import { saveSandboxMode } from '../player/sandboxMode';
import { PauseMenu } from '../ui/pauseMenu';
import {
  clampTouchControlOpacity,
  clampTouchControlScale,
  formatTouchControlOpacity,
  formatTouchControlScale,
  type TouchControlSettings,
} from '../ui/touchSettings';

type PauseMenuSetupOptions = {
  renderer: THREE.WebGLRenderer;
  isMobile: boolean;
  getWorldReady: () => boolean;
  getMouseSensitivity: () => number;
  setMouseSensitivity: (value: number) => void;
  getSandboxMode: () => boolean;
  setSandboxMode: (value: boolean) => void;
  getTouchControlSettings: () => TouchControlSettings;
  setTouchControlSettings: (settings: TouchControlSettings) => void;
  onTouchControlSettingsChange: (settings: TouchControlSettings) => void;
  sensitivityInputEl: HTMLInputElement;
  sensitivityValueEl: HTMLElement;
  renderDistanceInputEl: HTMLInputElement;
  renderDistanceValueEl: HTMLElement;
  sfxVolumeInputEl: HTMLInputElement;
  sfxVolumeValueEl: HTMLElement;
  musicVolumeInputEl: HTMLInputElement;
  musicVolumeValueEl: HTMLElement;
  sandboxInputEl: HTMLInputElement;
  savedSfxVol: string | null;
  savedMusicVol: string | null;
  audioEngine: {
    setSfxVolume: (v: number) => void;
    setMusicVolume: (v: number) => void;
  };
  applyRenderDistance: () => void;
};

export function setupPauseMenu(options: PauseMenuSetupOptions): PauseMenu {
  const touchDefaults = options.getTouchControlSettings();
  const pauseMenu = new PauseMenu(
    {
      onResume: () => {
        if (!options.isMobile && options.getWorldReady()) {
          options.renderer.domElement.requestPointerLock().catch(() => {});
        }
      },
      onSensitivityChange: (value) => {
        const sensitivity = clampMouseSensitivity(value);
        options.setMouseSensitivity(sensitivity);
        const label = formatMouseSensitivity(sensitivity);
        pauseMenu.sensitivityValueEl.textContent = label;
        options.sensitivityInputEl.value = String(sensitivity);
        options.sensitivityValueEl.textContent = label;
        saveMouseSensitivity(sensitivity);
      },
      onRenderDistanceChange: (value) => {
        const clamped = clampDetailRadius(value);
        const label = formatRenderDistance(clamped);
        pauseMenu.renderDistanceValueEl.textContent = label;
        options.renderDistanceInputEl.value = String(clamped);
        options.renderDistanceValueEl.textContent = label;
        setDetailRadius(clamped);
        options.applyRenderDistance();
      },
      onSfxVolumeChange: (value) => {
        options.audioEngine.setSfxVolume(value / 100);
        pauseMenu.sfxVolumeValueEl.textContent = `${value}%`;
        options.sfxVolumeInputEl.value = String(value);
        options.sfxVolumeValueEl.textContent = `${value}%`;
      },
      onMusicVolumeChange: (value) => {
        options.audioEngine.setMusicVolume(value / 100);
        pauseMenu.musicVolumeValueEl.textContent = `${value}%`;
        options.musicVolumeInputEl.value = String(value);
        options.musicVolumeValueEl.textContent = `${value}%`;
      },
      onSandboxChange: (checked) => {
        options.setSandboxMode(checked);
        saveSandboxMode(checked);
        options.sandboxInputEl.checked = checked;
      },
      onTouchScaleChange: (value) => {
        const settings = {
          ...options.getTouchControlSettings(),
          scale: clampTouchControlScale(value),
        };
        syncTouchSettings(pauseMenu, settings);
        options.setTouchControlSettings(settings);
        options.onTouchControlSettingsChange(settings);
      },
      onTouchOpacityChange: (value) => {
        const settings = {
          ...options.getTouchControlSettings(),
          opacity: clampTouchControlOpacity(value),
        };
        syncTouchSettings(pauseMenu, settings);
        options.setTouchControlSettings(settings);
        options.onTouchControlSettingsChange(settings);
      },
    },
    {
      sensitivityLabel: formatMouseSensitivity(options.getMouseSensitivity()),
      sensitivityValue: options.getMouseSensitivity(),
      renderDistanceLabel: formatRenderDistance(getDetailRadius()),
      renderDistanceValue: getDetailRadius(),
      sfxVolume: Math.round((options.savedSfxVol ? parseFloat(options.savedSfxVol) : 1) * 100),
      musicVolume: Math.round((options.savedMusicVol ? parseFloat(options.savedMusicVol) : 0.5) * 100),
      sandbox: options.getSandboxMode(),
      touchScale: touchDefaults.scale,
      touchOpacity: touchDefaults.opacity,
    },
  );
  return pauseMenu;
}

function syncTouchSettings(pauseMenu: PauseMenu, settings: TouchControlSettings): void {
  if (pauseMenu.touchScaleInputEl && pauseMenu.touchScaleValueEl) {
    pauseMenu.touchScaleInputEl.value = String(settings.scale);
    pauseMenu.touchScaleValueEl.textContent = formatTouchControlScale(settings.scale);
  }
  if (pauseMenu.touchOpacityInputEl && pauseMenu.touchOpacityValueEl) {
    pauseMenu.touchOpacityInputEl.value = String(settings.opacity);
    pauseMenu.touchOpacityValueEl.textContent = formatTouchControlOpacity(settings.opacity);
  }
}
