import { ATLAS_COLUMNS, ATLAS_TILE_SIZE, Tile } from '../atlas';

export function drawTile(
  context: CanvasRenderingContext2D,
  tile: Tile,
  base: string,
  accent: string,
  pattern: string,
): void {
  const x = (tile % ATLAS_COLUMNS) * ATLAS_TILE_SIZE;
  const y = Math.floor(tile / ATLAS_COLUMNS) * ATLAS_TILE_SIZE;
  context.fillStyle = base;
  context.fillRect(x, y, ATLAS_TILE_SIZE, ATLAS_TILE_SIZE);
  context.fillStyle = accent;

  const rand = (i: number) => {
    const n = Math.sin((tile + 1) * 93.17 + i * 17.13) * 43758.5453;
    return n - Math.floor(n);
  };

  if (pattern === 'speckles' || pattern === 'leaves') {
    const count = pattern === 'leaves' ? 42 : 28;
    for (let i = 0; i < count; i++) {
      context.globalAlpha = pattern === 'leaves' ? 0.36 : 0.22;
      context.fillRect(
        x + Math.floor(rand(i) * 16),
        y + Math.floor(rand(i + 100) * 16),
        1 + Math.floor(rand(i + 200) * 2),
        1,
      );
    }
  } else if (pattern === 'grassSide') {
    context.fillStyle = accent;
    context.fillRect(x, y + 5, 16, 11);
    context.globalAlpha = 0.2;
    context.fillStyle = '#7a4828';
    for (let i = 0; i < 18; i++) {
      context.fillRect(
        x + Math.floor(rand(i + 50) * 16),
        y + 5 + Math.floor(rand(i + 70) * 11),
        1 + Math.floor(rand(i + 90) * 2),
        1,
      );
    }
    context.globalAlpha = 1;
    context.fillStyle = base;
    for (let i = 0; i < 9; i++) {
      const gx = x + Math.floor(rand(i) * 16);
      context.fillRect(gx, y, 2, 5 + Math.floor(rand(i + 9) * 5));
    }
    context.globalAlpha = 0.18;
    context.fillStyle = '#8aa047';
    for (let i = 0; i < 10; i++) {
      context.fillRect(
        x + Math.floor(rand(i + 110) * 16),
        y + Math.floor(rand(i + 130) * 5),
        1,
        1,
      );
    }
    context.globalAlpha = 1;
  } else if (pattern === 'cracks') {
    context.globalAlpha = 0.28;
    for (let i = 0; i < 8; i++) {
      context.fillRect(x + Math.floor(rand(i) * 16), y + Math.floor(rand(i + 20) * 16), 3, 1);
    }
  } else if (pattern === 'bark') {
    context.globalAlpha = 0.32;
    for (let i = 1; i < 16; i += 4) context.fillRect(x + i, y, 1, 16);
  } else if (pattern === 'rings') {
    context.globalAlpha = 0.45;
    context.strokeStyle = accent;
    context.strokeRect(x + 3, y + 3, 10, 10);
    context.strokeRect(x + 6, y + 6, 4, 4);
  } else if (pattern === 'ore') {
    context.globalAlpha = 0.8;
    for (let i = 0; i < 7; i++) {
      context.fillRect(
        x + 2 + Math.floor(rand(i) * 12),
        y + 2 + Math.floor(rand(i + 30) * 12),
        2,
        2,
      );
    }
  } else if (pattern === 'planks') {
    context.globalAlpha = 0.5;
    context.fillRect(x, y + 5, 16, 1);
    context.fillRect(x, y + 11, 16, 1);
    context.fillRect(x + 5, y, 1, 5);
    context.fillRect(x + 10, y + 6, 1, 5);
  } else if (pattern === 'table') {
    context.globalAlpha = 0.55;
    context.strokeStyle = accent;
    context.strokeRect(x + 2, y + 2, 12, 12);
    context.fillRect(x + 4, y + 4, 8, 2);
    context.fillRect(x + 4, y + 10, 8, 2);
  } else if (pattern === 'furnace') {
    context.globalAlpha = 0.7;
    context.fillRect(x + 4, y + 5, 8, 6);
    context.fillStyle = '#2a2c2b';
    context.fillRect(x + 5, y + 6, 6, 4);
  } else if (pattern === 'gravel') {
    context.globalAlpha = 0.45;
    for (let i = 0; i < 36; i++) {
      const s = 1 + Math.floor(rand(i + 70) * 3);
      context.fillRect(x + Math.floor(rand(i) * 16), y + Math.floor(rand(i + 20) * 16), s, s);
    }
  } else if (pattern === 'snow') {
    context.globalAlpha = 0.26;
    for (let i = 0; i < 24; i++) {
      const sx = x + Math.floor(rand(i) * 16);
      const sy = y + Math.floor(rand(i + 40) * 16);
      const wide = rand(i + 80) > 0.72;
      context.fillRect(sx, sy, wide ? 2 : 1, 1);
    }
  } else if (pattern === 'grassBlade') {
    context.clearRect(x, y, 16, 16);
    context.globalAlpha = 1;
    context.fillStyle = accent;
    for (let i = 0; i < 8; i++) {
      const bx = x + 1 + i * 2;
      context.fillRect(bx, y + 5 + Math.floor(rand(i) * 4), 1, 10);
    }
  } else if (pattern === 'flower') {
    context.clearRect(x, y, 16, 16);
    context.globalAlpha = 1;
    context.fillStyle = base;
    context.fillRect(x + 7, y + 6, 2, 9);
    context.fillStyle = accent;
    context.fillRect(x + 6, y + 3, 4, 4);
    context.fillRect(x + 4, y + 5, 3, 3);
    context.fillRect(x + 9, y + 5, 3, 3);
  } else if (pattern === 'cobble') {
    context.globalAlpha = 0.5;
    context.strokeStyle = accent;
    context.strokeRect(x + 1, y + 1, 6, 5);
    context.strokeRect(x + 8, y + 1, 7, 6);
    context.strokeRect(x + 2, y + 7, 7, 7);
    context.strokeRect(x + 10, y + 8, 5, 6);
  } else if (pattern === 'birchBark') {
    context.globalAlpha = 0.75;
    for (let i = 0; i < 7; i++) {
      context.fillRect(
        x + Math.floor(rand(i) * 14),
        y + 1 + Math.floor(rand(i + 30) * 14),
        3 + Math.floor(rand(i + 60) * 4),
        1,
      );
    }
  } else if (pattern === 'mossyCobble') {
    context.globalAlpha = 0.45;
    context.strokeStyle = '#3e423f';
    context.strokeRect(x + 1, y + 1, 6, 5);
    context.strokeRect(x + 8, y + 1, 7, 6);
    context.strokeRect(x + 2, y + 7, 7, 7);
    context.strokeRect(x + 10, y + 8, 5, 6);
    context.fillStyle = accent;
    context.globalAlpha = 0.65;
    context.fillRect(x + 1, y + 1, 5, 3);
    context.fillRect(x + 9, y + 8, 4, 5);
  } else if (pattern === 'bricks') {
    context.globalAlpha = 0.62;
    context.fillRect(x, y + 4, 16, 1);
    context.fillRect(x, y + 9, 16, 1);
    context.fillRect(x, y + 14, 16, 1);
    for (let row = 0; row < 4; row++) {
      const offset = row % 2 === 0 ? 0 : 5;
      for (let bx = -offset; bx < 16; bx += 8) context.fillRect(x + bx, y + row * 5, 1, 5);
    }
  } else if (pattern === 'glass') {
    context.globalAlpha = 0.45;
    context.strokeStyle = accent;
    context.strokeRect(x + 1, y + 1, 14, 14);
    context.fillRect(x + 4, y + 3, 1, 7);
    context.fillRect(x + 8, y + 2, 1, 4);
  } else if (pattern === 'cactus') {
    context.globalAlpha = 0.5;
    context.fillRect(x + 3, y, 1, 16);
    context.fillRect(x + 12, y, 1, 16);
    for (let i = 0; i < 7; i++)
      context.fillRect(x + 5 + Math.floor(rand(i) * 6), y + Math.floor(rand(i + 20) * 16), 1, 1);
  } else if (pattern === 'pumpkin') {
    context.globalAlpha = 0.65;
    context.fillRect(x + 3, y, 1, 16);
    context.fillRect(x + 8, y, 1, 16);
    context.fillRect(x + 13, y, 1, 16);
    context.fillStyle = '#3b5c21';
    context.fillRect(x + 7, y, 2, 3);
  } else if (pattern === 'mushroom') {
    context.clearRect(x, y, 16, 16);
    context.globalAlpha = 1;
    context.fillStyle = base;
    context.fillRect(x + 7, y + 8, 2, 7);
    context.fillStyle = accent;
    context.fillRect(x + 4, y + 4, 8, 5);
    context.fillRect(x + 6, y + 2, 4, 3);
  } else if (pattern === 'berries') {
    context.clearRect(x, y, 16, 16);
    context.globalAlpha = 1;
    context.fillStyle = base;
    context.fillRect(x + 4, y + 5, 8, 10);
    context.fillStyle = accent;
    context.fillRect(x + 5, y + 6, 2, 2);
    context.fillRect(x + 10, y + 8, 2, 2);
    context.fillRect(x + 7, y + 11, 2, 2);
  } else if (pattern === 'water') {
    context.globalAlpha = 0.65;
    for (let i = 0; i < 5; i++) {
      const wy = y + 2 + i * 3;
      context.fillRect(x + Math.floor(rand(i) * 5), wy, 5 + Math.floor(rand(i + 20) * 4), 1);
      context.fillRect(x + 8 + Math.floor(rand(i + 40) * 4), wy + 1, 4, 1);
    }
    context.globalAlpha = 0.28;
    context.fillStyle = '#143f68';
    for (let i = 0; i < 14; i++) {
      context.fillRect(x + Math.floor(rand(i + 80) * 16), y + Math.floor(rand(i + 120) * 16), 1, 1);
    }
  } else if (pattern === 'chest') {
    context.globalAlpha = 0.65;
    context.fillStyle = accent;
    context.fillRect(x + 2, y + 10, 12, 1);
    context.fillRect(x + 7, y, 2, 1);
    context.fillStyle = '#6b4226';
    context.fillRect(x + 7, y + 1, 2, 1);
    context.globalAlpha = 1;
  } else if (pattern === 'door') {
    context.globalAlpha = 0.6;
    context.fillRect(x, y + 5, 16, 1);
    context.fillRect(x, y + 11, 16, 1);
    context.fillStyle = accent;
    context.globalAlpha = 0.85;
    context.fillRect(x + 2, y + 3, 12, 2);
    context.fillRect(x + 2, y + 11, 12, 2);
    context.fillRect(x + 2, y, 2, 16);
    context.fillRect(x + 12, y, 2, 16);
    context.globalAlpha = 1;
  } else if (pattern === 'amethyst') {
    context.globalAlpha = 0.5;
    for (let i = 0; i < 12; i++) {
      const px = Math.floor(rand(i) * 14);
      const py = Math.floor(rand(i + 20) * 14);
      context.fillRect(x + 1 + px, y + 1 + py, 2, 2);
    }
    context.globalAlpha = 0.3;
    context.fillStyle = '#c08ee0';
    for (let i = 0; i < 6; i++) {
      context.fillRect(x + Math.floor(rand(i + 40) * 16), y + Math.floor(rand(i + 60) * 16), 1, 1);
    }
  } else if (pattern === 'amethystCluster') {
    context.clearRect(x, y, 16, 16);
    context.globalAlpha = 1;
    context.fillStyle = base;
    context.fillRect(x + 3, y + 6, 2, 10);
    context.fillRect(x + 7, y + 3, 2, 13);
    context.fillRect(x + 11, y + 5, 2, 11);
    context.fillStyle = accent;
    context.fillRect(x + 2, y + 4, 4, 3);
    context.fillRect(x + 6, y + 1, 4, 3);
    context.fillRect(x + 10, y + 3, 4, 3);
  } else if (pattern === 'mossBlock') {
    context.globalAlpha = 0.4;
    for (let i = 0; i < 40; i++) {
      context.fillRect(x + Math.floor(rand(i) * 16), y + Math.floor(rand(i + 30) * 16), 1 + Math.floor(rand(i + 60) * 2), 1);
    }
    context.globalAlpha = 0.25;
    context.fillStyle = '#6aaa52';
    for (let i = 0; i < 8; i++) {
      context.fillRect(x + Math.floor(rand(i + 80) * 16), y + Math.floor(rand(i + 90) * 16), 2, 2);
    }
  } else if (pattern === 'glowBerry') {
    context.clearRect(x, y, 16, 16);
    context.globalAlpha = 1;
    context.fillStyle = base;
    context.fillRect(x + 5, y + 2, 6, 8);
    context.fillRect(x + 3, y + 4, 10, 4);
    context.fillStyle = accent;
    context.fillRect(x + 6, y + 5, 2, 2);
    context.fillRect(x + 9, y + 4, 2, 2);
    context.fillStyle = '#f0e060';
    context.globalAlpha = 0.7;
    context.fillRect(x + 7, y + 9, 2, 4);
  } else if (pattern === 'lava') {
    context.globalAlpha = 0.7;
    for (let i = 0; i < 6; i++) {
      const lx = Math.floor(rand(i) * 10);
      const ly = Math.floor(rand(i + 20) * 10);
      context.fillRect(x + lx, y + ly, 4 + Math.floor(rand(i + 40) * 4), 3);
    }
    context.globalAlpha = 0.4;
    context.fillStyle = '#ff6020';
    for (let i = 0; i < 10; i++) {
      context.fillRect(x + Math.floor(rand(i + 60) * 16), y + Math.floor(rand(i + 80) * 16), 2, 1);
    }
  } else if (pattern === 'basalt') {
    context.globalAlpha = 0.45;
    for (let i = 0; i < 5; i++) {
      const bx = Math.floor(rand(i) * 12);
      context.fillRect(x + bx, y, 2, 16);
    }
    context.globalAlpha = 0.2;
    context.fillStyle = '#504e58';
    for (let i = 0; i < 8; i++) {
      context.fillRect(x + Math.floor(rand(i + 30) * 16), y + Math.floor(rand(i + 50) * 16), 1, 1);
    }
  } else if (pattern === 'mossyStoneBrick') {
    context.globalAlpha = 0.55;
    context.fillRect(x, y + 4, 16, 1);
    context.fillRect(x, y + 9, 16, 1);
    context.fillRect(x, y + 14, 16, 1);
    context.fillRect(x + 5, y, 1, 5);
    context.fillRect(x + 11, y + 5, 1, 5);
    context.fillRect(x + 3, y + 10, 1, 5);
    context.fillStyle = accent;
    context.globalAlpha = 0.6;
    context.fillRect(x + 1, y + 1, 4, 3);
    context.fillRect(x + 8, y + 5, 5, 3);
    context.fillRect(x + 1, y + 10, 4, 4);
    context.fillRect(x + 12, y + 11, 3, 3);
  } else if (pattern === 'ironBars') {
    context.clearRect(x, y, 16, 16);
    context.globalAlpha = 1;
    context.fillStyle = base;
    context.fillRect(x + 3, y, 2, 16);
    context.fillRect(x + 7, y, 2, 16);
    context.fillRect(x + 11, y, 2, 16);
    context.fillStyle = accent;
    context.fillRect(x, y + 2, 16, 1);
    context.fillRect(x, y + 7, 16, 1);
    context.fillRect(x, y + 12, 16, 1);
  } else if (pattern === 'mycelium') {
    context.globalAlpha = 0.4;
    for (let i = 0; i < 30; i++) {
      context.fillRect(x + Math.floor(rand(i) * 16), y + Math.floor(rand(i + 20) * 16), 1 + Math.floor(rand(i + 40) * 2), 1);
    }
    context.globalAlpha = 0.25;
    context.fillStyle = '#c8a8d0';
    for (let i = 0; i < 10; i++) {
      context.fillRect(x + Math.floor(rand(i + 60) * 16), y + Math.floor(rand(i + 80) * 16), 1, 1);
    }
  } else if (pattern === 'mushroomStem') {
    context.globalAlpha = 0.3;
    for (let i = 0; i < 5; i++) {
      context.fillRect(x + 2 + Math.floor(rand(i) * 10), y, 2, 16);
    }
  } else if (pattern === 'mushroomCapRed') {
    context.globalAlpha = 0.7;
    for (let i = 0; i < 8; i++) {
      const dx = 2 + Math.floor(rand(i) * 10);
      const dy = 2 + Math.floor(rand(i + 20) * 10);
      context.fillRect(x + dx, y + dy, 3, 3);
    }
  } else if (pattern === 'mushroomCapBrown') {
    context.globalAlpha = 0.45;
    for (let i = 0; i < 20; i++) {
      context.fillRect(x + Math.floor(rand(i) * 16), y + Math.floor(rand(i + 30) * 16), 1 + Math.floor(rand(i + 60) * 2), 1);
    }
  } else if (pattern === 'obsidian') {
    context.globalAlpha = 0.4;
    for (let i = 0; i < 6; i++) {
      context.fillRect(x + Math.floor(rand(i) * 14), y + Math.floor(rand(i + 20) * 14), 3, 2);
    }
    context.globalAlpha = 0.15;
    context.fillStyle = '#2a1840';
    for (let i = 0; i < 10; i++) {
      context.fillRect(x + Math.floor(rand(i + 40) * 16), y + Math.floor(rand(i + 60) * 16), 1, 1);
    }
  } else if (pattern === 'spawner') {
    context.globalAlpha = 0.5;
    context.strokeStyle = accent;
    context.strokeRect(x + 1, y + 1, 14, 14);
    context.strokeRect(x + 4, y + 4, 8, 8);
    context.globalAlpha = 0.7;
    context.fillStyle = '#4a6a4a';
    context.fillRect(x + 6, y + 6, 4, 4);
    context.globalAlpha = 0.3;
    for (let i = 0; i < 8; i++) {
      context.fillStyle = '#3a5a3a';
      context.fillRect(x + Math.floor(rand(i) * 16), y + Math.floor(rand(i + 20) * 16), 1, 1);
    }
  }
  context.globalAlpha = 1;
}
