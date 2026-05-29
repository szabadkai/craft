export type TouchControlSettings = {
  scale: number;
  opacity: number;
};

const SCALE_KEY = 'craft-touch-control-scale';
const OPACITY_KEY = 'craft-touch-control-opacity';
const DEFAULT_SCALE = 1;
const DEFAULT_OPACITY = 0.9;

export function clampTouchControlScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SCALE;
  return Math.max(0.75, Math.min(1.4, value));
}

export function clampTouchControlOpacity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_OPACITY;
  return Math.max(0.35, Math.min(1, value));
}

export function loadTouchControlSettings(): TouchControlSettings {
  return {
    scale: clampTouchControlScale(Number(localStorage.getItem(SCALE_KEY) ?? DEFAULT_SCALE)),
    opacity: clampTouchControlOpacity(Number(localStorage.getItem(OPACITY_KEY) ?? DEFAULT_OPACITY)),
  };
}

export function saveTouchControlSettings(settings: TouchControlSettings): void {
  localStorage.setItem(SCALE_KEY, String(clampTouchControlScale(settings.scale)));
  localStorage.setItem(OPACITY_KEY, String(clampTouchControlOpacity(settings.opacity)));
}

export function formatTouchControlScale(value: number): string {
  return `${Math.round(clampTouchControlScale(value) * 100)}%`;
}

export function formatTouchControlOpacity(value: number): string {
  return `${Math.round(clampTouchControlOpacity(value) * 100)}%`;
}
