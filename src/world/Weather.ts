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

export function wrapCoord(v: number, min: number, size: number): number {
  let r = (v - min) % size;
  if (r < 0) r += size;
  return min + r;
}

const PARTICLE_COUNTS: Record<string, number> = {
  low: 300, balanced: 650, high: 1100, ultra: 1600,
};

export type QualityLevelLike = 'low' | 'balanced' | 'high' | 'ultra';

/**
 * Camera-following precipitation box. Zero-alloc per frame: preallocated
 * Float32Arrays, positions wrapped arithmetically around the camera.
 * Rain = streak LineSegments falling fast; snow = Points drifting slowly.
 */
export class WeatherParticles {
  readonly group = new THREE.Group();
  private weather: Weather = 'normal';
  private count = 0;
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
  private time = 0;

  constructor(private scene: THREE.Scene) {
    this.scene.add(this.group);
    this.group.visible = false;
    this.group.frustumCulled = false;
  }

  get active(): boolean { return this.weather !== 'normal'; }
  get current(): Weather { return this.weather; }
  get particleCount(): number { return this.count; }

  setQuality(q: QualityLevelLike): void {
    const n = PARTICLE_COUNTS[q] ?? PARTICLE_COUNTS.balanced;
    if (n === this.count && (this.rainLines || this.snowPoints)) {
      // Rebuild only when the weather kind changes; count already matches.
      return;
    }
    this.count = n;
    this.allocRain(n);
    this.allocSnow(n);
    this.applyVisibility();
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

  setWeather(w: Weather): void {
    this.weather = w;
    if (this.count === 0) this.setQuality('balanced');
    this.applyVisibility();
  }

  private applyVisibility(): void {
    this.group.visible = this.weather !== 'normal';
    if (this.rainLines) this.rainLines.visible = this.weather === 'rain';
    if (this.snowPoints) this.snowPoints.visible = this.weather === 'snow';
  }

  /** Seed the box around the camera so the first frame already has cover. */
  snapTo(cx: number, cz: number): void {
    const ox = cx - this.boxW / 2, oz = cz - this.boxD / 2;
    this.group.position.set(ox, 0, oz);
  }

  update(dt: number, cx: number, cz: number): void {
    if (this.weather === 'normal') return;
    const clamped = Math.max(0, Math.min(0.05, dt));
    if (clamped === 0) return;
    this.time += clamped;
    // Keep the box centered on the camera (group offset), particles in local space.
    this.group.position.set(cx - this.boxW / 2, 0, cz - this.boxD / 2);
    if (this.weather === 'rain' && this.rainLines) {
      const p = this.rainPos, n = this.count;
      for (let i = 0; i < n; i++) {
        let y = p[i * 6 + 1] - this.rainVel[i] * clamped;
        if (y < 0) y += this.boxH;
        p[i * 6 + 1] = y;
        p[i * 6 + 4] = y + 0.7;
      }
      this.rainGeo.attributes.position.needsUpdate = true;
    } else if (this.weather === 'snow' && this.snowPoints) {
      const p = this.snowPos, n = this.count;
      for (let i = 0; i < n; i++) {
        let y = p[i * 3 + 1] - this.snowVel[i] * clamped;
        if (y < 0) y += this.boxH;
        p[i * 3 + 1] = y;
        // Gentle sinusoidal drift (cheap sin per flake, no allocs).
        p[i * 3] += Math.sin(this.time * 1.3 + this.snowPhase[i]) * clamped * 0.8;
        // Wrap x/z locally so drift never escapes the box.
        if (p[i * 3] < 0) p[i * 3] += this.boxW; else if (p[i * 3] >= this.boxW) p[i * 3] -= this.boxW;
      }
      this.snowGeo.attributes.position.needsUpdate = true;
    }
  }

  dispose(): void {
    this.scene.remove(this.group);
    this.rainGeo.dispose(); this.snowGeo.dispose();
    if (this.rainLines) (this.rainLines.material as THREE.Material).dispose();
    if (this.snowPoints) (this.snowPoints.material as THREE.Material).dispose();
  }
}
