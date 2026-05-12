const STORAGE_KEY = 'craft-render-distance';
const DEFAULT_DETAIL_RADIUS = 8;
const MIN_DETAIL_RADIUS = 4;
const MAX_DETAIL_RADIUS = 12;

const LEVELS = [4, 6, 8, 10, 12] as const;
type DetailRadius = (typeof LEVELS)[number];

const LABELS: Record<DetailRadius, string> = {
  4: 'Tiny',
  6: 'Short',
  8: 'Normal',
  10: 'Far',
  12: 'Extreme',
};

export { type DetailRadius };

export function getDetailRadius(): number {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return DEFAULT_DETAIL_RADIUS;
  return clampDetailRadius(Number(stored));
}

export function setDetailRadius(value: number): void {
  localStorage.setItem(STORAGE_KEY, String(clampDetailRadius(value)));
}

export function clampDetailRadius(value: number): DetailRadius {
  if (!Number.isFinite(value)) return DEFAULT_DETAIL_RADIUS;
  const clamped = Math.min(MAX_DETAIL_RADIUS, Math.max(MIN_DETAIL_RADIUS, value));
  let best: DetailRadius = 4;
  for (const level of LEVELS) {
    if (Math.abs(level - clamped) < Math.abs(best - clamped)) best = level;
  }
  return best;
}

export function getPreloadRadius(): number {
  return getDetailRadius() + 2;
}

export function getFarRadius(): number {
  return getDetailRadius() * 5;
}

export function getFogNear(): number {
  return getDetailRadius() * 16; // CHUNK_SIZE
}

export function getFogFar(): number {
  return (getDetailRadius() + 10) * 16;
}

export function formatRenderDistance(value: number): string {
  const detail = clampDetailRadius(value);
  const label = LABELS[detail];
  const blocks = detail * 16;
  return `${label} (${detail} chunks / ${blocks} blocks)`;
}

export function renderDistanceLevels(): { value: DetailRadius; label: string }[] {
  return LEVELS.map((value) => ({ value, label: LABELS[value] }));
}