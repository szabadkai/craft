const STORAGE_KEY = 'craft-mouse-sensitivity';
const DEFAULT_SENSITIVITY = 1;
const MIN_SENSITIVITY = 0.25;
const MAX_SENSITIVITY = 6;
export const BASE_MOUSE_RADIANS_PER_PIXEL = 0.0024;

export function clampMouseSensitivity(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SENSITIVITY;
  return Math.min(MAX_SENSITIVITY, Math.max(MIN_SENSITIVITY, value));
}

export function loadMouseSensitivity(): number {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return DEFAULT_SENSITIVITY;
  return clampMouseSensitivity(Number(stored));
}

export function saveMouseSensitivity(value: number): void {
  localStorage.setItem(STORAGE_KEY, String(clampMouseSensitivity(value)));
}

export function formatMouseSensitivity(value: number): string {
  return `${clampMouseSensitivity(value).toFixed(2)}x`;
}
