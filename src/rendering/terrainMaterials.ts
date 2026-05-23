import * as THREE from 'three';
import { ATLAS_COLUMNS, ATLAS_ROWS, ATLAS_TILE_SIZE, Tile } from '../atlas';
import { getFarRadius } from '../player/renderDistance';
import { CHUNK_SIZE } from '../types';
import { drawTile } from './tilePatterns';

export function createSky(): THREE.Mesh {
  const radius = getFarRadius() * CHUNK_SIZE * 0.92;
  const geometry = new THREE.SphereGeometry(radius, 32, 16);
  const material = new THREE.ShaderMaterial({
    depthWrite: false,
    side: THREE.BackSide,
    uniforms: {
      topColor: { value: new THREE.Color(0x9ec6ec) },
      horizonColor: { value: new THREE.Color(0xe5f1f7) },
      groundColor: { value: new THREE.Color(0x8fac68) },
      sunColor: { value: new THREE.Color(0xffe1a1) },
      sunDirection: { value: new THREE.Vector3(0.62, 0.42, 0.2) },
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
      uniform vec3 sunDirection;
      varying vec3 vWorldDirection;
      void main() {
        float h = clamp(vWorldDirection.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 sky = mix(horizonColor, topColor, smoothstep(0.36, 1.0, h));
        sky = mix(groundColor, sky, smoothstep(0.02, 0.3, h));
        vec3 sunDir = normalize(sunDirection);
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
      sunDirection: { value: new THREE.Vector3(0.62, 0.42, 0.2) },
      sunBrightness: { value: 1.0 },
      fogColor: {
        value: fog instanceof THREE.Fog ? fog.color : new THREE.Color(0xd8e8f1),
      },
      fogNear: { value: fog instanceof THREE.Fog ? fog.near : 120 },
      fogFar: { value: fog instanceof THREE.Fog ? fog.far : 220 },
    },
    vertexShader: `
      attribute vec4 atlasRect;
      attribute vec2 light;
      varying vec2 vRepeatUv;
      varying vec4 vAtlasRect;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec2 vLight;

      void main() {
        vRepeatUv = uv;
        vAtlasRect = atlasRect;
        vColor = color;
        vNormal = normal;
        vLight = light;
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
      uniform vec3 sunDirection;
      uniform vec3 fogColor;
      uniform float fogNear;
      uniform float fogFar;
      uniform float sunBrightness;
      varying vec2 vRepeatUv;
      varying vec4 vAtlasRect;
      varying vec3 vColor;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec2 vLight;

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

        // Per-block lighting: skylight modulated by sun, blocklight is warm/constant
        float skyContrib = vLight.x * sunBrightness;
        float blockContrib = vLight.y;
        float lightLevel = max(skyContrib, blockContrib);
        // Remap to avoid total blackness: curve for more contrast
        float brightness = lightLevel * lightLevel * 0.92 + 0.08;

        // Subtle directional face shading (keep the old feel but lighter)
        vec3 normal = normalize(vNormal);
        vec3 sunDir = normalize(sunDirection);
        float sunFacing = max(dot(normal, sunDir), 0.0);
        float faceBias = isSnow
          ? 0.96 + sunFacing * 0.04
          : 0.94 + sunFacing * 0.06;
        color *= faceBias * brightness;

        // Blocklight warm tint (torches/lava glow warm)
        if (blockContrib > skyContrib) {
          float warmth = (blockContrib - skyContrib) * 0.35;
          color += vec3(0.12, 0.06, 0.0) * warmth * brightness;
        }

        if (isSnow) {
          color = mix(color, vec3(0.82, 0.88, 0.9) * brightness, 0.34);
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

export function createWaterMaterial(
  fog: THREE.Scene['fog'],
  waterLevel: number,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      waterLevel: { value: waterLevel },
      sunDirection: { value: new THREE.Vector3(0.62, 0.42, 0.2) },
      sunBrightness: { value: 1.0 },
      fogColor: {
        value: fog instanceof THREE.Fog ? fog.color : new THREE.Color(0xd8e8f1),
      },
      fogNear: { value: fog instanceof THREE.Fog ? fog.near : 120 },
      fogFar: { value: fog instanceof THREE.Fog ? fog.far : 220 },
    },
    vertexShader: `
      attribute vec2 light;
      uniform float time;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying float vWave;
      varying vec2 vLight;
      float waterWave(vec2 xz) {
        float wave = sin(xz.x * 2.3 + time * 1.6) * cos(xz.y * 2.7 + time * 1.3) * 0.07;
        wave += sin(xz.x * 4.1 + time * 2.1) * cos(xz.y * 3.9 - time * 1.8) * 0.035;
        wave += sin(xz.x * 6.5 - time * 2.8) * cos(xz.y * 5.1 + time * 2.4) * 0.02;
        return wave;
      }
      void main() {
        vLight = light;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vNormal = normal;
        float wave = 0.0;
        if (normal.y > 0.5) {
          vec2 xz = worldPos.xz;
          wave = waterWave(xz);
          float eps = 0.18;
          float left = waterWave(xz - vec2(eps, 0.0));
          float right = waterWave(xz + vec2(eps, 0.0));
          float down = waterWave(xz - vec2(0.0, eps));
          float up = waterWave(xz + vec2(0.0, eps));
          vNormal = normalize(vec3(left - right, eps * 2.0, down - up));
        }
        vWave = wave;
        worldPos.y += wave;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float waterLevel;
      uniform vec3 sunDirection;
      uniform float sunBrightness;
      uniform vec3 fogColor;
      uniform float fogNear;
      uniform float fogFar;
      varying vec3 vWorldPosition;
      varying vec3 vNormal;
      varying float vWave;
      varying vec2 vLight;
      void main() {
        vec3 waterDeep   = vec3(0.06, 0.18, 0.42);
        vec3 waterMid    = vec3(0.18, 0.42, 0.58);
        vec3 waterShallow = vec3(0.38, 0.62, 0.74);
        float depthFactor = clamp((vWorldPosition.y - waterLevel + 4.0) / 8.0, 0.0, 1.0);
        vec3 waterColor = mix(waterDeep, waterMid, depthFactor);

        // Per-block lighting
        float skyContrib = vLight.x * sunBrightness;
        float blockContrib = vLight.y;
        float lightLevel = max(skyContrib, blockContrib);
        float brightness = lightLevel * lightLevel * 0.92 + 0.08;

        // wave crest highlights
        float crest = smoothstep(0.02, 0.09, vWave);
        waterColor = mix(waterColor, waterShallow, crest * 0.55);

        // subtle time-based shimmer
        float shimmer = sin(vWorldPosition.x * 8.0 + time * 2.3) * cos(vWorldPosition.z * 7.0 - time * 1.9) * 0.03;
        waterColor += shimmer;

        // specular sun reflection
        vec3 normal = normalize(vNormal);
        vec3 sunDir = normalize(sunDirection);
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        vec3 halfVec = normalize(sunDir + viewDir);
        float spec = pow(max(dot(normal, halfVec), 0.0), 180.0) * 0.5;
        waterColor += vec3(1.0, 0.95, 0.78) * spec * brightness;

        // fresnel edge darkening
        float fresnel = 1.0 - abs(dot(normal, viewDir));
        waterColor = mix(waterColor, waterDeep * 0.7, fresnel * 0.35);

        // foam on wave peaks
        float foam = smoothstep(0.065, 0.095, vWave) * 0.18;
        waterColor = mix(waterColor, vec3(0.85, 0.92, 0.95), foam);

        // Apply brightness
        waterColor *= brightness;

        // fog
        float fogDepth = length(cameraPosition - vWorldPosition);
        float fogFactor = smoothstep(fogNear, fogFar, fogDepth);
        waterColor = mix(waterColor, fogColor, fogFactor);

        gl_FragColor = vec4(waterColor, 0.72);
      }
    `,
    transparent: true,
    depthWrite: false,
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
  drawTile(context, Tile.Chest, '#8b5e3c', '#d4a05a', 'chest');
  drawTile(context, Tile.DoorOak, '#a6753b', '#6d4424', 'door');
  drawTile(context, Tile.Amethyst, '#7b3e9e', '#4a1f6e', 'amethyst');
  drawTile(context, Tile.AmethystCluster, '#9e5ec0', '#c38ee0', 'amethystCluster');
  drawTile(context, Tile.MossBlock, '#4a7a3a', '#2d5c22', 'mossBlock');
  drawTile(context, Tile.GlowBerry, '#3e7d34', '#e8c83a', 'glowBerry');
  drawTile(context, Tile.Lava, '#d45a0a', '#f2a030', 'lava');
  drawTile(context, Tile.Basalt, '#3a3840', '#252328', 'basalt');
  drawTile(context, Tile.MossyStoneBrick, '#6a7268', '#3a5c30', 'mossyStoneBrick');
  drawTile(context, Tile.IronBars, '#8a8a8a', '#4a4a4a', 'ironBars');
  drawTile(context, Tile.Spawner, '#2a3a2a', '#1a2a1a', 'spawner');
  drawTile(context, Tile.Mycelium, '#8a6e8e', '#5c4060', 'mycelium');
  drawTile(context, Tile.MushroomStem, '#d4cabb', '#a89e8c', 'mushroomStem');
  drawTile(context, Tile.MushroomCapRed, '#c42020', '#ffffff', 'mushroomCapRed');
  drawTile(context, Tile.MushroomCapBrown, '#7a4a28', '#5a3218', 'mushroomCapBrown');
  drawTile(context, Tile.Obsidian, '#1a0e24', '#0a0610', 'obsidian');
  drawTile(context, Tile.Torch, '#7c522b', '#f0c040', 'torch');
  drawTile(context, Tile.EmeraldOre, '#858984', '#2ecc40', 'ore');
  drawTile(context, Tile.RedstoneOre, '#858984', '#cc2020', 'ore');

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  return texture;
}
