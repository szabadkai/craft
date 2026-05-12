import * as THREE from 'three';

// Minecraft-style day: 24000 ticks per full cycle, 20 real minutes default
const TICKS_PER_DAY = 24000;
const DAY_LENGTH_SECONDS = 1200; // 20 min
const TICKS_PER_SECOND = TICKS_PER_DAY / DAY_LENGTH_SECONDS; // 20

// ── keyframe helpers ──────────────────────────────────────────────

type ColorStop = { time: number; hex: number };
type FloatStop = { time: number; value: number };

function lerpColor(stops: ColorStop[], time: number): THREE.Color {
  if (stops.length === 0) return new THREE.Color();
  if (time <= stops[0].time) return new THREE.Color(stops[0].hex);
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (time <= b.time) {
      const t = (time - a.time) / (b.time - a.time);
      return new THREE.Color(a.hex).lerp(new THREE.Color(b.hex), t);
    }
  }
  return new THREE.Color(stops[stops.length - 1].hex);
}

function lerpFloat(stops: FloatStop[], time: number): number {
  if (stops.length === 0) return 1;
  if (time <= stops[0].time) return stops[0].value;
  for (let i = 0; i < stops.length - 1; i++) {
    if (time <= stops[i + 1].time) {
      const t = (time - stops[i].time) / (stops[i + 1].time - stops[i].time);
      return stops[i].value + (stops[i + 1].value - stops[i].value) * t;
    }
  }
  return stops[stops.length - 1].value;
}

// ── color keyframes ───────────────────────────────────────────────
// times: 0=dawn 6000=noon 12000=dusk 18000=midnight 24000=next dawn

const SKY_TOP: ColorStop[] = [
  { time: 0, hex: 0xf7a079 },
  { time: 2000, hex: 0x8ebbee },
  { time: 5000, hex: 0x5ba0f2 },
  { time: 9000, hex: 0x8ebbee },
  { time: 12000, hex: 0xf28c5e },
  { time: 14000, hex: 0x1a1e3a },
  { time: 22000, hex: 0x1a1e3a },
  { time: 24000, hex: 0xf7a079 },
];

const SKY_HORIZON: ColorStop[] = [
  { time: 0, hex: 0xffe4c8 },
  { time: 2000, hex: 0xc8dcf0 },
  { time: 5000, hex: 0xb4d4f8 },
  { time: 9000, hex: 0xc8dcf0 },
  { time: 12000, hex: 0xffd0a8 },
  { time: 14000, hex: 0x2a2e48 },
  { time: 22000, hex: 0x2a2e48 },
  { time: 24000, hex: 0xffe4c8 },
];

const SKY_GROUND: ColorStop[] = [
  { time: 0, hex: 0xb8c888 },
  { time: 2000, hex: 0x9cb878 },
  { time: 5000, hex: 0x8fac68 },
  { time: 9000, hex: 0x9cb878 },
  { time: 12000, hex: 0xa89060 },
  { time: 14000, hex: 0x202830 },
  { time: 22000, hex: 0x202830 },
  { time: 24000, hex: 0xb8c888 },
];

const SUN_COLOR: ColorStop[] = [
  { time: 0, hex: 0xffd080 },
  { time: 1500, hex: 0xfff4d0 },
  { time: 4000, hex: 0xfffaf0 },
  { time: 8000, hex: 0xfffaf0 },
  { time: 10500, hex: 0xfff4d0 },
  { time: 12000, hex: 0xffa060 },
  { time: 13500, hex: 0x8060a0 },
  { time: 22500, hex: 0x8060a0 },
  { time: 24000, hex: 0xffd080 },
];

const FOG_COLOR: ColorStop[] = [
  { time: 0, hex: 0xffe8d0 },
  { time: 2000, hex: 0xc8dcf0 },
  { time: 5000, hex: 0xd8e8f1 },
  { time: 9000, hex: 0xc8dcf0 },
  { time: 12000, hex: 0xffd0b0 },
  { time: 14000, hex: 0x18202c },
  { time: 22000, hex: 0x18202c },
  { time: 24000, hex: 0xffe8d0 },
];

const BG_COLOR: ColorStop[] = [
  { time: 0, hex: 0xfedcc0 },
  { time: 2000, hex: 0xa5cceb },
  { time: 5000, hex: 0xd8e8f1 },
  { time: 9000, hex: 0xa5cceb },
  { time: 12000, hex: 0xf2b890 },
  { time: 14000, hex: 0x101828 },
  { time: 22000, hex: 0x101828 },
  { time: 24000, hex: 0xfedcc0 },
];

const AMBIENT_COLOR: ColorStop[] = [
  { time: 0, hex: 0xffe8d0 },
  { time: 3000, hex: 0xf8fbff },
  { time: 5000, hex: 0xffffff },
  { time: 9000, hex: 0xf8fbff },
  { time: 12000, hex: 0xffd8b8 },
  { time: 14000, hex: 0x304060 },
  { time: 22000, hex: 0x304060 },
  { time: 24000, hex: 0xffe8d0 },
];

const AMBIENT_INTENSITY: FloatStop[] = [
  { time: 0, value: 1.55 },
  { time: 3000, value: 2.05 },
  { time: 9000, value: 2.05 },
  { time: 12000, value: 1.45 },
  { time: 14000, value: 0.28 },
  { time: 22000, value: 0.28 },
  { time: 24000, value: 1.55 },
];

const DIRECTIONAL_COLOR: ColorStop[] = [
  { time: 0, hex: 0xffc888 },
  { time: 1500, hex: 0xfff4d0 },
  { time: 4000, hex: 0xfffdf0 },
  { time: 8000, hex: 0xfffdf0 },
  { time: 10500, hex: 0xfff4d0 },
  { time: 12000, hex: 0xffb068 },
  { time: 13500, hex: 0x405070 },
  { time: 22500, hex: 0x405070 },
  { time: 24000, hex: 0xffc888 },
];

const DIRECTIONAL_INTENSITY: FloatStop[] = [
  { time: 0, value: 1.20 },
  { time: 2000, value: 1.75 },
  { time: 5000, value: 1.85 },
  { time: 8000, value: 1.75 },
  { time: 12000, value: 1.10 },
  { time: 13500, value: 0.25 },
  { time: 22500, value: 0.25 },
  { time: 24000, value: 1.20 },
];

// ── cycle state ───────────────────────────────────────────────────

export class DayNightCycle {
  timeOfDay = 0; // 0 .. 24000

  get progress(): number {
    return this.timeOfDay / TICKS_PER_DAY;
  }

  update(dt: number): void {
    this.timeOfDay = (this.timeOfDay + dt * TICKS_PER_SECOND) % TICKS_PER_DAY;
  }

  /** Normalized direction vector from world origin toward the sun */
  sunDirection(out?: THREE.Vector3): THREE.Vector3 {
    const sunAngle = this.progress * Math.PI * 2;
    const elev = Math.sin(sunAngle) * (Math.PI / 2);
    const horiz = sunAngle;
    const dx = Math.cos(elev) * Math.cos(horiz);
    const dy = Math.sin(elev);
    const dz = Math.cos(elev) * Math.sin(horiz);
    if (out) return out.set(dx, dy, dz).normalize();
    return new THREE.Vector3(dx, dy, dz).normalize();
  }

  skyTopColor(out?: THREE.Color): THREE.Color {
    this._tmpColor = lerpColor(SKY_TOP, this.timeOfDay);
    return out ? out.copy(this._tmpColor) : this._tmpColor.clone();
  }

  skyHorizonColor(out?: THREE.Color): THREE.Color {
    this._tmpColor = lerpColor(SKY_HORIZON, this.timeOfDay);
    return out ? out.copy(this._tmpColor) : this._tmpColor.clone();
  }

  skyGroundColor(out?: THREE.Color): THREE.Color {
    this._tmpColor = lerpColor(SKY_GROUND, this.timeOfDay);
    return out ? out.copy(this._tmpColor) : this._tmpColor.clone();
  }

  sunColor(out?: THREE.Color): THREE.Color {
    this._tmpColor = lerpColor(SUN_COLOR, this.timeOfDay);
    return out ? out.copy(this._tmpColor) : this._tmpColor.clone();
  }

  fogColor(out?: THREE.Color): THREE.Color {
    this._tmpColor = lerpColor(FOG_COLOR, this.timeOfDay);
    return out ? out.copy(this._tmpColor) : this._tmpColor.clone();
  }

  backgroundColor(out?: THREE.Color): THREE.Color {
    this._tmpColor = lerpColor(BG_COLOR, this.timeOfDay);
    return out ? out.copy(this._tmpColor) : this._tmpColor.clone();
  }

  ambientColor(out?: THREE.Color): THREE.Color {
    this._tmpColor = lerpColor(AMBIENT_COLOR, this.timeOfDay);
    return out ? out.copy(this._tmpColor) : this._tmpColor.clone();
  }

  ambientIntensity(): number {
    return lerpFloat(AMBIENT_INTENSITY, this.timeOfDay);
  }

  directionalColor(out?: THREE.Color): THREE.Color {
    this._tmpColor = lerpColor(DIRECTIONAL_COLOR, this.timeOfDay);
    return out ? out.copy(this._tmpColor) : this._tmpColor.clone();
  }

  directionalIntensity(): number {
    return lerpFloat(DIRECTIONAL_INTENSITY, this.timeOfDay);
  }

  // ── convenience: apply to a Three.js scene ──────────────────────

  applyToLights(
    hemi: THREE.HemisphereLight,
    sun: THREE.DirectionalLight,
    skyMeshMaterial?: THREE.ShaderMaterial,
  ): void {
    // ambient
    hemi.color.copy(this.ambientColor(hemi.color));
    hemi.intensity = this.ambientIntensity();

    // sun directional
    const dir = this.sunDirection();
    // position sun far away in that direction so directional light is correct
    sun.position.copy(dir.clone().multiplyScalar(200));
    sun.color.copy(this.directionalColor(sun.color));
    sun.intensity = this.directionalIntensity();

    // sky shader uniforms
    if (skyMeshMaterial) {
      skyMeshMaterial.uniforms.topColor.value.copy(this.skyTopColor());
      skyMeshMaterial.uniforms.horizonColor.value.copy(this.skyHorizonColor());
      skyMeshMaterial.uniforms.groundColor.value.copy(this.skyGroundColor());
      skyMeshMaterial.uniforms.sunColor.value.copy(this.sunColor());
      skyMeshMaterial.uniforms.sunDirection.value.copy(dir);
    }
  }

  applyToTerrainMaterials(
    terrain: THREE.ShaderMaterial,
    fade: THREE.ShaderMaterial,
    water: THREE.ShaderMaterial,
    transparent: THREE.ShaderMaterial,
    deco: THREE.ShaderMaterial,
  ): void {
    const dir = this.sunDirection();
    for (const mat of [terrain, fade, water, transparent, deco]) {
      const u = mat.uniforms;
      if (u.sunDirection) u.sunDirection.value.copy(dir);
      if (u.fogColor) u.fogColor.value.copy(this.fogColor());
    }
  }

  applyToScene(scene: THREE.Scene): void {
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(this.fogColor());
    }
    (scene.background as THREE.Color).copy(this.backgroundColor());
  }

  private _tmpColor = new THREE.Color();
}
