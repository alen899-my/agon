import * as THREE from 'three';

export type Weather = 'normal' | 'rain' | 'snow';

export interface WeatherPreset {
  sky: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  sunColor: number;
  sunIntensity: number;
  ambientIntensity: number;
  exposure: number;
  roadTint: number;
  roadRoughness: number;
  /** Wet gloss for rain ( puddle sheen ). 0 = dry. */
  wetGloss: number;
  /** Full snow-blanket tints applied on top of the theme base. */
  snowBlanket: boolean;
  /** Tire grip multiplier (1 = dry, <1 = slippery). */
  grip: number;
  nightDarken: number;
}

export const WEATHER_PRESETS: Record<Weather, WeatherPreset> = {
  normal: {
    sky: 0xffffff, // placeholder: theme base wins; overlay only tweaks
    fog: 0xffffff,
    fogNear: -1, fogFar: -1, // -1 = keep theme fog range
    sunColor: 0xffffff, sunIntensity: 1,
    ambientIntensity: 1, exposure: 1,
    roadTint: 0xffffff, roadRoughness: 1, wetGloss: 0,
    snowBlanket: false, grip: 1, nightDarken: 0,
  },
  rain: {
    sky: 0x8fa3b5, fog: 0x8fa3b5,
    fogNear: 45, fogFar: 190,
    sunColor: 0xcfd8e3, sunIntensity: 0.55,
    ambientIntensity: 0.85, exposure: 0.96,
    roadTint: 0x2c3138, roadRoughness: 0.35, wetGloss: 0.7,
    snowBlanket: false, grip: 0.85, nightDarken: 0.12,
  },
  snow: {
    sky: 0xdfe8f2, fog: 0xdfe8f2,
    fogNear: 55, fogFar: 220,
    sunColor: 0xffffff, sunIntensity: 0.8,
    ambientIntensity: 1.1, exposure: 1.02,
    roadTint: 0xe8edf3, roadRoughness: 0.9, wetGloss: 0,
    snowBlanket: true, grip: 0.7, nightDarken: 0.05,
  },
};

export const WEATHER_GRIP: Record<Weather, number> = {
  normal: 1, rain: 0.85, snow: 0.7,
};

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type DriftKind = 'none' | 'petal' | 'leaf';

export interface SeasonPreset {
  /** Foliage tint (-1 = keep theme color). */
  leafTint: number;
  /** Ground tint (-1 = keep theme color). */
  pavementTint: number;
  /** Sunlight tint (-1 = keep theme color). */
  sunTint: number;
  sunIntensity: number;
  exposure: number;
  /** Fog tint (-1 = keep theme/weather color). */
  fogTint: number;
  fogNear: number; fogFar: number; // -1 = keep
  drift: DriftKind;
  driftColor: number;
  /** Snow blanket on verges/foliage/roofs (roads stay clear unless condition = snow). */
  snowBlanket: boolean;
  nightDarken: number;
}

export const SEASON_PRESETS: Record<Season, SeasonPreset> = {
  spring: {
    leafTint: 0x5cb85c, pavementTint: -1,
    sunTint: 0xfff4e0, sunIntensity: 1.02, exposure: 1.02,
    fogTint: 0xdcefe0, fogNear: -1, fogFar: -1,
    drift: 'petal', driftColor: 0xf6c9d8,
    snowBlanket: false, nightDarken: 0,
  },
  summer: {
    leafTint: 0x3f9142, pavementTint: -1,
    sunTint: 0xffe9c0, sunIntensity: 1.12, exposure: 1.05,
    fogTint: 0xf2e6cf, fogNear: 80, fogFar: 240,
    drift: 'none', driftColor: 0xffffff,
    snowBlanket: false, nightDarken: 0,
  },
  autumn: {
    leafTint: 0xc47b2d, pavementTint: -1,
    sunTint: 0xffd9a8, sunIntensity: 0.92, exposure: 0.98,
    fogTint: 0xe6d3b3, fogNear: 70, fogFar: 230,
    drift: 'leaf', driftColor: 0xd98a3d,
    snowBlanket: false, nightDarken: 0.04,
  },
  winter: {
    leafTint: 0xc9d4d6, pavementTint: 0xe6ebf0,
    sunTint: 0xe8f0ff, sunIntensity: 0.82, exposure: 1.0,
    fogTint: 0xdfe8f2, fogNear: 60, fogFar: 225,
    drift: 'none', driftColor: 0xffffff,
    snowBlanket: true, nightDarken: 0.06,
  },
};

export function wrapCoord(v: number, min: number, size: number): number {
  let r = (v - min) % size;
  if (r < 0) r += size;
  return min + r;
}

const PARTICLE_COUNTS: Record<string, number> = {
  low: 300, balanced: 650, high: 1100, ultra: 1600,
};

/** 5-step intensity: 1 = light, 3 = normal (today's look), 5 = extreme. */
export type IntensityLevel = 1 | 2 | 3 | 4 | 5;
/** Fraction of the over-allocated buffer actually drawn per level. */
const INTENSITY_FRAC: Record<IntensityLevel, number> = { 1: 0.2, 2: 0.35, 3: 0.45, 4: 0.7, 5: 1 };
const INTENSITY_SPEED: Record<IntensityLevel, number> = { 1: 0.8, 2: 0.9, 3: 1, 4: 1.2, 5: 1.4 };
const INTENSITY_ALPHA: Record<IntensityLevel, number> = { 1: 0.75, 2: 0.9, 3: 1, 4: 1, 5: 1 };
/** Buffers are over-allocated so level 5 draws past the old maximum. */
const INTENSITY_OVERALLOC = 2.2;
/** Sun + exposure multiplier per level (brightens noon at 4–5, dims at 1–2). */
export const INTENSITY_SUN: Record<IntensityLevel, number> = { 1: 0.9, 2: 0.95, 3: 1, 4: 1.2, 5: 1.4 };
/** Rain-loop volume per level. */
export const INTENSITY_RAIN_VOL: Record<IntensityLevel, number> = { 1: 0.02, 2: 0.035, 3: 0.05, 4: 0.07, 5: 0.1 };
/** Fog range multipliers: low = crystal clear air, 5 = can't see far. */
export const INTENSITY_FOG_NEAR: Record<IntensityLevel, number> = { 1: 1.2, 2: 1.1, 3: 1, 4: 0.8, 5: 0.6 };
export const INTENSITY_FOG_FAR: Record<IntensityLevel, number> = { 1: 1.15, 2: 1.05, 3: 1, 4: 0.75, 5: 0.5 };
/** Storm gloom: extra exposure dip while raining/snowing at high levels. */
export const INTENSITY_GLOOM: Record<IntensityLevel, number> = { 1: 1.03, 2: 1.01, 3: 1, 4: 0.94, 5: 0.86 };

export function clampIntensity(n: number): IntensityLevel {
  const c = Math.max(1, Math.min(5, Math.round(n)));
  return c as IntensityLevel;
}

export type QualityLevelLike = 'low' | 'balanced' | 'high' | 'ultra';

/**
 * Camera-following precipitation + seasonal drift box. Zero-alloc per frame:
 * preallocated Float32Arrays, positions wrapped arithmetically around the camera.
 * Rain = streak LineSegments falling fast; snow = Points drifting slowly;
 * petal/leaf = colored Points swaying down (spring/autumn ambience).
 */
export class WeatherParticles {
  readonly group = new THREE.Group();
  private weather: Weather = 'normal';
  private season: Season = 'spring';
  private count = 0;
  private intensity: IntensityLevel = 3;
  /** Particles actually drawn/updated (subset of the over-allocated buffer). */
  private activeN = 0;
  private boxW = 44; private boxH = 30; private boxD = 44;
  private rainPos: Float32Array = new Float32Array(0);
  private rainVel: Float32Array = new Float32Array(0);
  private rainGeo = new THREE.BufferGeometry();
  private rainLines: THREE.LineSegments | null = null;
  private snowPos: Float32Array = new Float32Array(0);
  private snowVel: Float32Array = new Float32Array(0);
  private snowPhase: Float32Array = new Float32Array(0);
  private snowGeo = new THREE.BufferGeometry();
  private snowPoints: THREE.Points | null = null;
  private driftPos: Float32Array = new Float32Array(0);
  private driftVel: Float32Array = new Float32Array(0);
  private driftPhase: Float32Array = new Float32Array(0);
  private driftGeo = new THREE.BufferGeometry();
  private driftPoints: THREE.Points | null = null;
  private time = 0;

  private get driftKind(): DriftKind { return SEASON_PRESETS[this.season].drift; }
  get currentSeason(): Season { return this.season; }

  constructor(private scene: THREE.Scene) {
    this.scene.add(this.group);
    this.group.visible = false;
    this.group.frustumCulled = false;
  }

  get active(): boolean { return this.weather !== 'normal' || this.driftKind !== 'none'; }
  get current(): Weather { return this.weather; }
  get particleCount(): number { return this.count; }

  setQuality(q: QualityLevelLike): void {
    const n = PARTICLE_COUNTS[q] ?? PARTICLE_COUNTS.balanced;
    if (n === this.count && (this.rainLines || this.snowPoints)) {
      // Rebuild only when the weather kind changes; count already matches.
      return;
    }
    this.count = n;
    const over = Math.ceil(n * INTENSITY_OVERALLOC);
    this.allocRain(over);
    this.allocSnow(over);
    this.allocDrift(over);
    this.applyIntensityRange();
    this.applyVisibility();
  }

  /** 1 = light … 5 = extreme. Level 3 reproduces the classic look. */
  setIntensityLevel(level: number): void {
    const next = clampIntensity(level);
    if (next === this.intensity && this.activeN > 0) return;
    this.intensity = next;
    this.applyIntensityRange();
  }
  get intensityLevel(): IntensityLevel { return this.intensity; }

  private applyIntensityRange(): void {
    const over = Math.ceil(this.count * INTENSITY_OVERALLOC);
    this.activeN = Math.max(1, Math.floor(over * INTENSITY_FRAC[this.intensity]));
    if (this.rainLines) {
      this.rainGeo.setDrawRange(0, this.activeN * 2);
      (this.rainLines.material as THREE.LineBasicMaterial).opacity = 0.55 * INTENSITY_ALPHA[this.intensity];
    }
    if (this.snowPoints) {
      this.snowGeo.setDrawRange(0, this.activeN);
      (this.snowPoints.material as THREE.PointsMaterial).opacity = 0.9 * INTENSITY_ALPHA[this.intensity];
    }
    if (this.driftPoints) {
      this.driftGeo.setDrawRange(0, this.activeN);
      (this.driftPoints.material as THREE.PointsMaterial).opacity = 0.85 * INTENSITY_ALPHA[this.intensity];
    }
  }

  private allocRain(n: number): void {
    if (this.rainLines) { this.group.remove(this.rainLines); this.rainGeo.dispose(); (this.rainLines.material as THREE.Material).dispose(); this.rainGeo = new THREE.BufferGeometry(); this.rainLines = null; }
    this.rainPos = new Float32Array(n * 2 * 3);
    this.rainVel = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = Math.random() * this.boxW, y = Math.random() * this.boxH, z = Math.random() * this.boxD;
      this.rainPos[i * 6] = x; this.rainPos[i * 6 + 1] = y; this.rainPos[i * 6 + 2] = z;
      this.rainPos[i * 6 + 3] = x; this.rainPos[i * 6 + 4] = y + 0.7; this.rainPos[i * 6 + 5] = z;
      this.rainVel[i] = 22 + Math.random() * 8;
    }
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xaac4dd, transparent: true, opacity: 0.55 });
    this.rainLines = new THREE.LineSegments(this.rainGeo, mat);
    this.rainLines.frustumCulled = false;
    this.group.add(this.rainLines);
  }

  private allocSnow(n: number): void {
    if (this.snowPoints) { this.group.remove(this.snowPoints); this.snowGeo.dispose(); (this.snowPoints.material as THREE.Material).dispose(); this.snowGeo = new THREE.BufferGeometry(); this.snowPoints = null; }
    this.snowPos = new Float32Array(n * 3);
    this.snowVel = new Float32Array(n);
    this.snowPhase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.snowPos[i * 3] = Math.random() * this.boxW;
      this.snowPos[i * 3 + 1] = Math.random() * this.boxH;
      this.snowPos[i * 3 + 2] = Math.random() * this.boxD;
      this.snowVel[i] = 1.2 + Math.random() * 1.8;
      this.snowPhase[i] = Math.random() * Math.PI * 2;
    }
    this.snowGeo.setAttribute('position', new THREE.BufferAttribute(this.snowPos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.14, transparent: true, opacity: 0.9, sizeAttenuation: true, depthWrite: false });
    this.snowPoints = new THREE.Points(this.snowGeo, mat);
    this.snowPoints.frustumCulled = false;
    this.group.add(this.snowPoints);
  }

  private allocDrift(n: number): void {
    if (this.driftPoints) { this.group.remove(this.driftPoints); this.driftGeo.dispose(); (this.driftPoints.material as THREE.Material).dispose(); this.driftGeo = new THREE.BufferGeometry(); this.driftPoints = null; }
    this.driftPos = new Float32Array(n * 3);
    this.driftVel = new Float32Array(n);
    this.driftPhase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.driftPos[i * 3] = Math.random() * this.boxW;
      this.driftPos[i * 3 + 1] = Math.random() * this.boxH;
      this.driftPos[i * 3 + 2] = Math.random() * this.boxD;
      this.driftVel[i] = 0.5 + Math.random() * 0.9;
      this.driftPhase[i] = Math.random() * Math.PI * 2;
    }
    this.driftGeo.setAttribute('position', new THREE.BufferAttribute(this.driftPos, 3));
    const mat = new THREE.PointsMaterial({ color: SEASON_PRESETS[this.season].driftColor, size: 0.11, transparent: true, opacity: 0.85, sizeAttenuation: true, depthWrite: false });
    this.driftPoints = new THREE.Points(this.driftGeo, mat);
    this.driftPoints.frustumCulled = false;
    this.group.add(this.driftPoints);
  }

  setWeather(w: Weather): void {
    this.weather = w;
    if (this.count === 0) this.setQuality('balanced');
    this.applyVisibility();
  }

  setSeason(s: Season): void {
    if (this.season === s && this.driftPoints) { this.applyVisibility(); return; }
    this.season = s;
    if (this.count === 0) this.setQuality('balanced');
    if (this.driftPoints) (this.driftPoints.material as THREE.PointsMaterial).color.setHex(SEASON_PRESETS[s].driftColor);
    this.applyVisibility();
  }

  private applyVisibility(): void {
    const drift = this.driftKind !== 'none';
    this.group.visible = this.weather !== 'normal' || drift;
    if (this.rainLines) this.rainLines.visible = this.weather === 'rain';
    if (this.snowPoints) this.snowPoints.visible = this.weather === 'snow';
    if (this.driftPoints) this.driftPoints.visible = drift;
  }

  /** Seed the box around the camera so the first frame already has cover. */
  snapTo(cx: number, cz: number): void {
    const ox = cx - this.boxW / 2, oz = cz - this.boxD / 2;
    this.group.position.set(ox, 0, oz);
  }

  update(dt: number, cx: number, cz: number): void {
    if (this.weather === 'normal' && this.driftKind === 'none') return;
    const clamped = Math.max(0, Math.min(0.05, dt));
    if (clamped === 0) return;
    this.time += clamped;
    // Keep the box centered on the camera (group offset), particles in local space.
    this.group.position.set(cx - this.boxW / 2, 0, cz - this.boxD / 2);
    if (this.weather === 'rain' && this.rainLines) {
      const p = this.rainPos, n = this.activeN, spd = INTENSITY_SPEED[this.intensity];
      for (let i = 0; i < n; i++) {
        let y = p[i * 6 + 1] - this.rainVel[i] * spd * clamped;
        if (y < 0) y += this.boxH;
        p[i * 6 + 1] = y;
        p[i * 6 + 4] = y + 0.7;
      }
      this.rainGeo.attributes.position.needsUpdate = true;
    } else if (this.weather === 'snow' && this.snowPoints) {
      const p = this.snowPos, n = this.activeN, spd = INTENSITY_SPEED[this.intensity];
      for (let i = 0; i < n; i++) {
        let y = p[i * 3 + 1] - this.snowVel[i] * spd * clamped;
        if (y < 0) y += this.boxH;
        p[i * 3 + 1] = y;
        // Gentle sinusoidal drift (cheap sin per flake, no allocs).
        p[i * 3] += Math.sin(this.time * 1.3 + this.snowPhase[i]) * clamped * 0.8;
        // Wrap x/z locally so drift never escapes the box.
        if (p[i * 3] < 0) p[i * 3] += this.boxW; else if (p[i * 3] >= this.boxW) p[i * 3] -= this.boxW;
      }
      this.snowGeo.attributes.position.needsUpdate = true;
    }
    if (this.driftKind !== 'none' && this.driftPoints) {
      // Petals/leaves: slow fall, wide sway, full-box wrap.
      const p = this.driftPos, n = this.activeN, spd = INTENSITY_SPEED[this.intensity];
      const sway = this.driftKind === 'petal' ? 1.4 : 1.0;
      for (let i = 0; i < n; i++) {
        let y = p[i * 3 + 1] - this.driftVel[i] * spd * clamped;
        if (y < 0) y += this.boxH;
        p[i * 3 + 1] = y;
        p[i * 3] += Math.sin(this.time * 0.9 + this.driftPhase[i]) * clamped * sway;
        p[i * 3 + 2] += Math.cos(this.time * 0.7 + this.driftPhase[i]) * clamped * sway * 0.6;
        if (p[i * 3] < 0) p[i * 3] += this.boxW; else if (p[i * 3] >= this.boxW) p[i * 3] -= this.boxW;
        if (p[i * 3 + 2] < 0) p[i * 3 + 2] += this.boxD; else if (p[i * 3 + 2] >= this.boxD) p[i * 3 + 2] -= this.boxD;
      }
      this.driftGeo.attributes.position.needsUpdate = true;
    }
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.rainGeo.dispose(); this.snowGeo.dispose(); this.driftGeo.dispose();
    if (this.rainLines) (this.rainLines.material as THREE.Material).dispose();
    if (this.snowPoints) (this.snowPoints.material as THREE.Material).dispose();
    if (this.driftPoints) (this.driftPoints.material as THREE.Material).dispose();
  }
}
