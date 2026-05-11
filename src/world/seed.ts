export function seedFromString(value: string): number {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 0;
  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) return Math.trunc(numeric) | 0;

  let hash = 2166136261;
  for (let i = 0; i < trimmed.length; i++) {
    hash ^= trimmed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}

export function randomSeedText(): string {
  const first = ['amber', 'cedar', 'copper', 'frost', 'moss', 'river', 'stone', 'willow'];
  const second = ['basin', 'bluff', 'grove', 'hollow', 'mesa', 'ridge', 'spring', 'valley'];
  const suffix = Math.floor(Math.random() * 900 + 100);
  return `${first[Math.floor(Math.random() * first.length)]}-${second[Math.floor(Math.random() * second.length)]}-${suffix}`;
}
