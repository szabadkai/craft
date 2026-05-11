import * as THREE from 'three';
import { ATLAS_COLUMNS, ATLAS_ROWS, ATLAS_TILE_SIZE, Tile } from '../atlas';
import { CHUNK_SIZE, FAR_RADIUS } from '../types';

export function createSky(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(CHUNK_SIZE * FAR_RADIUS * 0.92, 32, 16);
  const material = new THREE.ShaderMaterial({
    depthWrite: false,
    side: THREE.BackSide,
    uniforms: {
      topColor: { value: new THREE.Color(0x9ec6ec) },
      horizonColor: { value: new THREE.Color(0xe5f1f7) },
      groundColor: { value: new THREE.Color(0x8fac68) },
      sunColor: { value: new THREE.Color(0xffe1a1) },
    },
    vertexShader: `
      varying vec3 vWorldDirection;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 groundColor;
      uniform vec3 sunColor;
      varying vec3 vWorldDirection;
      void main() {
        float h = clamp(vWorldDirection.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 sky = mix(horizonColor, topColor, smoothstep(0.36, 1.0, h));
        sky = mix(groundColor, sky, smoothstep(0.02, 0.3, h));
        vec3 sunDir = normalize(vec3(0.62, 0.42, 0.2));
        float sun = pow(max(dot(normalize(vWorldDirection), sunDir), 0.0), 520.0);
        float glow = pow(max(dot(normalize(vWorldDirection), sunDir), 0.0), 10.0) * 0.24;
        gl_FragColor = vec4(sky + sunColor * (sun + glow), 1.0);
      }
    `,
  });
  return new THREE.Mesh(geometry, material);
}

export function createTerrainMaterial(
  atlas: THREE.CanvasTexture,
  fog: THREE.Scene['fog'],
  opacity: number,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      atlasMap: { value: atlas },
      tileSize: { value: ATLAS_TILE_SIZE },
      opacity: { value: opacity },
      time: { value: 0 },
      fogColor: {
        value: fog instanceof THREE.Fog ? fog.color : new THREE.Color(0xd8e8f1),
      },
      fogNear: { value: fog instanceof THREE.Fog ? fog.near : 120 },
      fogFar: { value: fog instanceof THREE.Fog ? fog.far : 220 },
    },
    vertexShader: `
      attribute vec4 atlasRect;
      varying vec2 vRepeatUv;
      varying vec4 vAtlasRect;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      void main() {
        vRepeatUv = uv;
        vAtlasRect = atlasRect;
        vColor = color;
        vNormal = normal;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D atlasMap;
      uniform float tileSize;
      uniform float opacity;
      uniform float time;
      uniform vec3 fogColor;
      uniform float fogNear;
      uniform float fogFar;
      varying vec2 vRepeatUv;
      varying vec4 vAtlasRect;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      float hashTile(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      vec3 gradeBlockColor(vec3 color) {
        float luma = dot(color, vec3(0.299, 0.587, 0.114));
        color = mix(vec3(luma), color, 1.08);
        color = (color - 0.5) * 0.99 + 0.5;
        color *= vec3(1.15, 1.08, 0.98);
        return clamp(color + vec3(0.075, 0.065, 0.045), 0.0, 1.0);
      }

      void main() {
        vec2 tileUv = (floor(fract(vRepeatUv) * tileSize) + 0.5) / tileSize;
        vec2 atlasUv = vAtlasRect.xy + tileUv * vAtlasRect.zw;
        vec4 texel = texture2D(atlasMap, atlasUv);
        if (texel.a < 0.45) discard;
        bool isWater = vAtlasRect.x > 0.74 && vAtlasRect.y < 0.02;
        bool isSnow =
          (vAtlasRect.x > 0.74 && vAtlasRect.y > 0.54 && vAtlasRect.y < 0.57) ||
          (dot(texel.rgb, vec3(0.299, 0.587, 0.114)) > 0.68 && texel.b >= texel.r * 0.92);
        vec3 n = abs(normalize(vNormal));
        vec2 tileCoord = n.y > 0.5
          ? floor(vWorldPosition.xz)
          : n.x > 0.5
            ? floor(vWorldPosition.zy)
            : floor(vWorldPosition.xy);
        float variation = mix(0.98, 1.08, hashTile(tileCoord));
        vec3 color = gradeBlockColor(texel.rgb * vColor * variation);
        vec3 normal = normalize(vNormal);
        vec3 sunDir = normalize(vec3(0.62, 0.42, 0.2));
        float sunFacing = max(dot(normal, sunDir), 0.0);
        float warmLight = isSnow
          ? 0.84 + sunFacing * 0.08 + max(normal.y, 0.0) * 0.03
          : 1.16 + sunFacing * 0.22 + max(normal.y, 0.0) * 0.08;
        color *= warmLight;
        if (isSnow) {
          color += vec3(0.025, 0.03, 0.035);
        } else {
          color += vec3(0.11, 0.09, 0.055) * (0.55 + max(normal.y, 0.0) * 0.45);
        }
        if (isWater) {
          float waveA = sin((vWorldPosition.x + time * 1.7) * 1.7 + vWorldPosition.z * 0.6);
          float waveB = sin((vWorldPosition.z - time * 1.2) * 2.1 + vWorldPosition.x * 0.45);
          float wave = smoothstep(1.12, 1.82, waveA + waveB);
          color = mix(vec3(0.16, 0.34, 0.55), vec3(0.62, 0.78, 0.88), wave * 0.42 + sunFacing * 0.28);
          color += vec3(1.0, 0.86, 0.55) * pow(max(dot(normalize(cameraPosition - vWorldPosition), reflect(-sunDir, normal)), 0.0), 28.0) * 0.7;
        } else if (isSnow) {
          color = mix(color, vec3(0.82, 0.88, 0.9), 0.34);
          color = min(color, vec3(0.9, 0.94, 0.95));
        }
        float fogDepth = length(cameraPosition - vWorldPosition);
        float fogFactor = smoothstep(fogNear, fogFar, fogDepth);
        vec3 finalColor = mix(color, fogColor, fogFactor);
        if (isSnow) finalColor = min(finalColor, vec3(0.9, 0.94, 0.95));
        gl_FragColor = vec4(finalColor, texel.a * opacity);
      }
    `,
    vertexColors: true,
    transparent: opacity < 1,
    depthWrite: opacity >= 1,
    side: THREE.DoubleSide,
  });
}

export function createTerrainAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLUMNS * ATLAS_TILE_SIZE;
  canvas.height = ATLAS_ROWS * ATLAS_TILE_SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create terrain atlas');
  context.imageSmoothingEnabled = false;

  drawTile(context, Tile.GrassTop, '#708b38', '#9ba849', 'speckles');
  drawTile(context, Tile.GrassSide, '#788d3f', '#965a31', 'grassSide');
  drawTile(context, Tile.Dirt, '#8d5432', '#6b3a23', 'speckles');
  drawTile(context, Tile.Stone, '#7b7b79', '#5d5d5b', 'cracks');
  drawTile(context, Tile.LogSide, '#7c522b', '#5b351d', 'bark');
  drawTile(context, Tile.LogTop, '#a06b36', '#6f431f', 'rings');
  drawTile(context, Tile.Leaves, '#5a7534', '#3a5d29', 'leaves');
  drawTile(context, Tile.Sand, '#c7b16f', '#a69155', 'speckles');
  drawTile(context, Tile.CoalOre, '#767a76', '#252525', 'ore');
  drawTile(context, Tile.IronOre, '#858984', '#b68155', 'ore');
  drawTile(context, Tile.Planks, '#a6753b', '#6d4424', 'planks');
  drawTile(context, Tile.CraftingTable, '#9a612f', '#57331c', 'table');
  drawTile(context, Tile.Furnace, '#666a67', '#343735', 'furnace');
  drawTile(context, Tile.Gravel, '#74736e', '#4d4d49', 'gravel');
  drawTile(context, Tile.Clay, '#7f969c', '#5e777f', 'speckles');
  drawTile(context, Tile.Snow, '#dce6e7', '#a9bec5', 'snow');
  drawTile(context, Tile.CopperOre, '#858984', '#b56a3a', 'ore');
  drawTile(context, Tile.GoldOre, '#858984', '#e0b83c', 'ore');
  drawTile(context, Tile.DiamondOre, '#777d7d', '#56d5dd', 'ore');
  drawTile(context, Tile.TallGrass, '#819541', '#435a2b', 'grassBlade');
  drawTile(context, Tile.RedFlower, '#4d8f35', '#c92323', 'flower');
  drawTile(context, Tile.YellowFlower, '#4d8f35', '#e7c52a', 'flower');
  drawTile(context, Tile.Cobblestone, '#6e716d', '#424542', 'cobble');
  drawTile(context, Tile.BirchLogSide, '#d3c89f', '#403326', 'birchBark');
  drawTile(context, Tile.BirchLogTop, '#d8bd7a', '#8b6332', 'rings');
  drawTile(context, Tile.BirchLeaves, '#7f8f3e', '#5a6932', 'leaves');
  drawTile(context, Tile.MossyCobblestone, '#65715d', '#2f5e2c', 'mossyCobble');
  drawTile(context, Tile.Brick, '#974632', '#5a241e', 'bricks');
  drawTile(context, Tile.Glass, '#9fd4dc', '#e6fbff', 'glass');
  drawTile(context, Tile.CactusSide, '#348c43', '#1f5f2f', 'cactus');
  drawTile(context, Tile.CactusTop, '#3b9a49', '#245f31', 'speckles');
  drawTile(context, Tile.Pumpkin, '#dc741e', '#7d3f13', 'pumpkin');
  drawTile(context, Tile.BlueFlower, '#4d8f35', '#3757d8', 'flower');
  drawTile(context, Tile.Mushroom, '#d7c3a2', '#b33b2d', 'mushroom');
  drawTile(context, Tile.BerryBush, '#3e7d34', '#c22d39', 'berries');
  drawTile(context, Tile.Water, '#2f76b8', '#b7d9ef', 'water');

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  return texture;
}

function drawTile(
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
    context.fillStyle = base;
    for (let i = 0; i < 9; i++) {
      const gx = x + Math.floor(rand(i) * 16);
      context.fillRect(gx, y, 2, 5 + Math.floor(rand(i + 9) * 5));
    }
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
  }
  context.globalAlpha = 1;
}
