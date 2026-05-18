import { biomeAt, reservoirWaterSurfaceAt, terrainHeight } from './terrain';

export type MinimapIn = {
  cx: number;
  cz: number;
  seed: number;
  size: number;
  half: number;
  scale: number;
};

export type MinimapOut = {
  cx: number;
  cz: number;
  data: Uint8ClampedArray;
};

const BIOME_COLORS: Record<string, [number, number, number]> = {
  plains: [0x5a, 0x8f, 0x3c],
  forest: [0x3d, 0x6b, 0x2e],
  hills: [0x7a, 0x7a, 0x6e],
  beach: [0xd4, 0xc5, 0x76],
  snow: [0xe8, 0xea, 0xec],
  dry: [0xb5, 0xa4, 0x4c],
};
const HIGH_HILL_COLOR: [number, number, number] = [0x9a, 0x9a, 0x8a];
const DEFAULT_COLOR = BIOME_COLORS.plains;

self.onmessage = (event: MessageEvent<MinimapIn>) => {
  const { cx, cz, seed, size, half, scale } = event.data;
  const data = new Uint8ClampedArray(size * size * 4);

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const wx = cx + (px - half) * scale;
      const wz = cz + (py - half) * scale;
      const h = terrainHeight(wx, wz, seed);
      const i = (py * size + px) * 4;

      const waterSurface = reservoirWaterSurfaceAt(wx, wz, seed);
      if (waterSurface !== null && waterSurface > h) {
        const depth = Math.max(0, waterSurface - h);
        const darkening = Math.max(0.5, 1 - depth * 0.03);
        data[i] = 51 * darkening;
        data[i + 1] = 102 * darkening;
        data[i + 2] = 170 * darkening;
        data[i + 3] = 255;
        continue;
      }

      const biome = biomeAt(wx, wz, seed);
      let color: [number, number, number];
      if (biome === 'hills' && h > 55) {
        color = HIGH_HILL_COLOR;
      } else {
        color = BIOME_COLORS[biome] ?? DEFAULT_COLOR;
      }

      const shade = 0.85 + (h - 40) * 0.004;
      data[i] = Math.min(255, color[0] * shade);
      data[i + 1] = Math.min(255, color[1] * shade);
      data[i + 2] = Math.min(255, color[2] * shade);
      data[i + 3] = 255;
    }
  }

  const result: MinimapOut = { cx, cz, data };
  self.postMessage(result, [data.buffer as ArrayBuffer]);
};
