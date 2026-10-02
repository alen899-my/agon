import { VEHICLES, type VehicleKind } from '../world/Vehicles';

/**
 * Continuous vehicle audio, synthesized with WebAudio (no assets).
 *
 * Voice chain (per engine):
 *   2x detuned harmonic-series oscillators + sub  -> waveshaper (growl)
 *   -> lowpass (opens with revs/throttle) -> 2 exhaust "formant" peaks
 *   + filtered noise (intake/exhaust hiss)  + optional turbo/EV whine
 *   -> gain -> stereo pan -> master compressor
 * Plus tire/wind roll noise for the player and a better skid screech.
 *
 * Pure helpers are unit-tested; anything touching AudioContext is created
 * lazily and import-safe in Node (tests).
 */

export type EngineFlavor = 'car' | 'sport' | 'suv' | 'truck' | 'van' | 'service' | 'bus' | 'ev';
export interface Timbre {
  wave: OscillatorType; detuneCents: number;
  baseHz: number; topHz: number; baseGain: number;
  /** Diesel chug: amplitude wobble rate/depth (0 = off). */
  chopHz: number; chopDepth: number;
  /** Stepped gears (1 = single-speed glide, like a real EV). */
  gears: number;
}

/** Extra character settings (kept separate so Timbre stays unchanged). */
interface Character {
  harmonics: number;   // how many harmonics in the source wave
  rolloff: number;     // higher = darker/smoother, lower = buzzier
  even: number;        // even-harmonic boost (>1 = fuller, "rounder" engine)
  drive: number;       // waveshaper distortion amount (growl)
  noise: number;       // intake/exhaust noise level
  formants: [number, number]; // exhaust resonance peaks (Hz)
  lope: number;        // idle irregularity in cents (rough idle)
  whine: number;       // turbo / EV motor whine level (0 = off)
  whineBase: number; whineSpan: number; // whine freq range (Hz)
  whineLoad: number;   // 0..1 how much whine depends on throttle
}

const EV_KINDS: readonly VehicleKind[] = ['egt', 'esedan', 'hummer'];

export function flavorFor(kind: VehicleKind): EngineFlavor {
  if ((EV_KINDS as readonly string[]).includes(kind)) return 'ev';
  return VEHICLES[kind].category;
}

export const TIMBRES: Record<EngineFlavor, Timbre> = {
  car: { wave: 'sawtooth', detuneCents: 9, baseHz: 58, topHz: 230, baseGain: 0.11, chopHz: 0, chopDepth: 0, gears: 5 },
  sport: { wave: 'sawtooth', detuneCents: 16, baseHz: 78, topHz: 360, baseGain: 0.12, chopHz: 0, chopDepth: 0, gears: 6 },
  suv: { wave: 'square', detuneCents: 10, baseHz: 52, topHz: 175, baseGain: 0.1, chopHz: 0, chopDepth: 0, gears: 5 },
  truck: { wave: 'square', detuneCents: 7, baseHz: 40, topHz: 130, baseGain: 0.13, chopHz: 9, chopDepth: 0.4, gears: 5 },
  van: { wave: 'square', detuneCents: 7, baseHz: 46, topHz: 150, baseGain: 0.11, chopHz: 8, chopDepth: 0.3, gears: 5 },
  service: { wave: 'square', detuneCents: 8, baseHz: 42, topHz: 150, baseGain: 0.12, chopHz: 10, chopDepth: 0.35, gears: 5 },
  bus: { wave: 'square', detuneCents: 6, baseHz: 36, topHz: 115, baseGain: 0.13, chopHz: 8, chopDepth: 0.4, gears: 4 },
  ev: { wave: 'sine', detuneCents: 5, baseHz: 190, topHz: 880, baseGain: 0.045, chopHz: 0, chopDepth: 0, gears: 1 },
};

const CHARACTER: Record<EngineFlavor, Character> = {
  car:     { harmonics: 28, rolloff: 0.95, even: 1.1, drive: 2.2, noise: 0.5,  formants: [190, 620],  lope: 6,  whine: 0,   whineBase: 0,    whineSpan: 0,    whineLoad: 0 },
  sport:   { harmonics: 36, rolloff: 0.8,  even: 1.2, drive: 3.0, noise: 0.45, formants: [240, 900],  lope: 3,  whine: 0.5, whineBase: 2200, whineSpan: 3000, whineLoad: 1 },
  suv:     { harmonics: 24, rolloff: 1.0,  even: 0.9, drive: 2.4, noise: 0.55, formants: [150, 480],  lope: 8,  whine: 0,   whineBase: 0,    whineSpan: 0,    whineLoad: 0 },
  truck:   { harmonics: 22, rolloff: 1.1,  even: 0.8, drive: 2.8, noise: 0.7,  formants: [110, 380],  lope: 10, whine: 0,   whineBase: 0,    whineSpan: 0,    whineLoad: 0 },
  van:     { harmonics: 22, rolloff: 1.05, even: 0.85, drive: 2.5, noise: 0.6, formants: [130, 430],  lope: 9,  whine: 0,   whineBase: 0,    whineSpan: 0,    whineLoad: 0 },
  service: { harmonics: 22, rolloff: 1.1,  even: 0.8, drive: 2.7, noise: 0.65, formants: [120, 400],  lope: 10, whine: 0,   whineBase: 0,    whineSpan: 0,    whineLoad: 0 },
  bus:     { harmonics: 20, rolloff: 1.2,  even: 0.8, drive: 2.6, noise: 0.8,  formants: [95, 330],   lope: 12, whine: 0,   whineBase: 0,    whineSpan: 0,    whineLoad: 0 },
  ev:      { harmonics: 6,  rolloff: 1.6,  even: 1.0, drive: 0.8, noise: 0.25, formants: [400, 1200], lope: 0,  whine: 1.0, whineBase: 900,  whineSpan: 3200, whineLoad: 0.3 },
};

/** Nobody hears engines past this distance. */
export const AUDIBLE_RADIUS = 45;
/** Traffic voice pool size (player gets a dedicated voice). */
export const TRAFFIC_VOICES = 5;

/** Which stepped gear the speed sits in (0-based; always 0 for single-speed). */
export function gearFor(speed: number, topSpeed: number, gears: number): number {
  if (gears <= 1) return 0;
  const r = Math.max(0, Math.min(1, Math.abs(speed) / Math.max(1, topSpeed)));
  return Math.min(gears - 1, Math.floor(r * gears));
}

/**
 * Engine pitch: each gear sweeps ~55%→100% of the rev range, then the next
 * gear drops back down (classic stepped shift). Launches ease up from idle.
 * Single-speed (EV) glides continuously instead.
 */
export function rpmHz(speed: number, topSpeed: number, timbre: Timbre): number {
  const r = Math.max(0, Math.min(1, Math.abs(speed) / Math.max(1, topSpeed)));
  if (timbre.gears <= 1) return timbre.baseHz + (timbre.topHz - timbre.baseHz) * Math.pow(r, 0.8);
  const total = r * timbre.gears;
  const frac = total - Math.min(timbre.gears - 1, Math.floor(total));
  const floorF = 0.55 * Math.min(1, total * 1.5);
  return timbre.baseHz + (timbre.topHz - timbre.baseHz) * (floorF + (1 - floorF) * frac);
}

/** 1 up close, fading quadratically to 0 at the audible edge. */
export function gainFromDistance(dist: number): number {
  if (dist <= 6) return 1;
  if (dist >= AUDIBLE_RADIUS) return 0;
  const t = (dist - 6) / (AUDIBLE_RADIUS - 6);
  return (1 - t) * (1 - t);
}

export interface TrafficSource { key: string; kind: VehicleKind; x: number; z: number; speed: number }
export interface TrafficVoice extends TrafficSource { dist: number }

/** Nearest-N audible traffic by distance. Pure — unit tested. */
export function nearestTraffic(items: TrafficSource[], lx: number, lz: number, maxN: number, maxDist = AUDIBLE_RADIUS): TrafficVoice[] {
  return items
    .map(i => ({ ...i, dist: Math.hypot(i.x - lx, i.z - lz) }))
    .filter(i => i.dist <= maxDist)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, maxN);
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

// ---------------------------------------------------------------------------
// Voice construction
// ---------------------------------------------------------------------------

interface Voice {
  osc1: OscillatorNode; osc2: OscillatorNode; sub: OscillatorNode; subGain: GainNode;
  mix: GainNode; filter: BiquadFilterNode; f1: BiquadFilterNode; f2: BiquadFilterNode;
  noiseSrc: AudioBufferSourceNode; noiseFilter: BiquadFilterNode; noiseGain: GainNode;
  whine: OscillatorNode | null; whineGain: GainNode | null;
  lope: OscillatorNode; lopeGain: GainNode;
  chop: OscillatorNode | null; chopGain: GainNode | null;
  gain: GainNode; panner: StereoPannerNode;
  flavor: EngineFlavor; gear: number; stopping: boolean;
}

const waveCache = new WeakMap<AudioContext, Map<EngineFlavor, PeriodicWave>>();

/** Harmonic-rich source wave: sounds like an engine's firing pulses, not a raw saw. */
function getWave(ac: AudioContext, flavor: EngineFlavor): PeriodicWave {
  let m = waveCache.get(ac);
  if (!m) { m = new Map(); waveCache.set(ac, m); }
  let w = m.get(flavor);
  if (!w) {
    const c = CHARACTER[flavor];
    const n = c.harmonics + 1;
    const real = new Float32Array(n), imag = new Float32Array(n);
    for (let h = 1; h < n; h++) imag[h] = (1 / Math.pow(h, c.rolloff)) * (h % 2 === 0 ? c.even : 1);
    w = ac.createPeriodicWave(real, imag);
    m.set(flavor, w);
  }
  return w;
}

function makeCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 1024, curve = new Float32Array(n);
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) curve[i] = Math.tanh((i / (n - 1) * 2 - 1) * drive) / norm;
  return curve;
}

function createVoice(ac: AudioContext, dest: AudioNode, flavor: EngineFlavor, noiseBuf: AudioBuffer): Voice {
  const t = TIMBRES[flavor], c = CHARACTER[flavor];
  const wave = getWave(ac, flavor);

  const osc1 = ac.createOscillator(), osc2 = ac.createOscillator();
  osc1.setPeriodicWave(wave); osc2.setPeriodicWave(wave);
  osc1.frequency.value = t.baseHz; osc2.frequency.value = t.baseHz;
  osc1.detune.value = -t.detuneCents; osc2.detune.value = t.detuneCents;

  const sub = ac.createOscillator(), subGain = ac.createGain();
  sub.type = 'sine'; sub.frequency.value = t.baseHz / 2; subGain.gain.value = 0.5;

  // Mix level feeds the waveshaper: more input = more growl under throttle.
  const mix = ac.createGain(); mix.gain.value = 0.4;
  const shaper = ac.createWaveShaper();
  shaper.curve = makeCurve(c.drive); shaper.oversample = '2x';

  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = 900; filter.Q.value = 0.9;
  const f1 = ac.createBiquadFilter(), f2 = ac.createBiquadFilter();
  f1.type = 'peaking'; f1.frequency.value = c.formants[0]; f1.Q.value = 2.2; f1.gain.value = 7;
  f2.type = 'peaking'; f2.frequency.value = c.formants[1]; f2.Q.value = 1.6; f2.gain.value = 5;

  const gain = ac.createGain(); gain.gain.value = 0;
  const panner = ac.createStereoPanner();

  osc1.connect(mix); osc2.connect(mix); sub.connect(subGain).connect(mix);
  mix.connect(shaper).connect(filter).connect(f1).connect(f2).connect(gain);

  // Noise layer (intake/exhaust air), joins after the shaper so it stays clean.
  const noiseSrc = ac.createBufferSource();
  noiseSrc.buffer = noiseBuf; noiseSrc.loop = true;
  noiseSrc.loopStart = Math.random() * 0.5; // de-correlate voices
  const noiseFilter = ac.createBiquadFilter();
  noiseFilter.type = 'bandpass'; noiseFilter.frequency.value = 600; noiseFilter.Q.value = 0.7;
  const noiseGain = ac.createGain(); noiseGain.gain.value = 0;
  noiseSrc.connect(noiseFilter).connect(noiseGain).connect(gain);

  // Turbo / EV motor whine.
  let whine: OscillatorNode | null = null, whineGain: GainNode | null = null;
  if (c.whine > 0) {
    whine = ac.createOscillator(); whineGain = ac.createGain();
    whine.type = 'sine'; whine.frequency.value = c.whineBase; whineGain.gain.value = 0;
    whine.connect(whineGain).connect(gain);
    whine.start();
  }

  // Slow random-ish pitch wobble = rough idle ("lope"). Fades out as revs rise.
  const lope = ac.createOscillator(), lopeGain = ac.createGain();
  lope.type = 'sine'; lope.frequency.value = 5 + Math.random() * 3; lopeGain.gain.value = c.lope;
  lope.connect(lopeGain); lopeGain.connect(osc1.detune); lopeGain.connect(osc2.detune);
  lope.start();

  // Diesel chug.
  let chop: OscillatorNode | null = null, chopGain: GainNode | null = null;
  if (t.chopHz > 0) {
    chop = ac.createOscillator(); chopGain = ac.createGain();
    chop.type = 'sine'; chop.frequency.value = t.chopHz;
    chopGain.gain.value = t.baseGain * t.chopDepth;
    chop.connect(chopGain).connect(gain.gain);
    chop.start();
  }

  gain.connect(panner).connect(dest);
  osc1.start(); osc2.start(); sub.start(); noiseSrc.start();

  return {
    osc1, osc2, sub, subGain, mix, filter, f1, f2, noiseSrc, noiseFilter, noiseGain,
    whine, whineGain, lope, lopeGain, chop, chopGain, gain, panner,
    flavor, gear: -1, stopping: false,
  };
}

function stopVoice(ac: AudioContext, v: Voice): void {
  if (v.stopping) return;
  v.stopping = true;
  const now = ac.currentTime;
  v.gain.gain.cancelScheduledValues(now);
  v.gain.gain.setTargetAtTime(0, now, 0.08);
  const nodes = [v.osc1, v.osc2, v.sub, v.noiseSrc, v.whine, v.lope, v.chop];
  for (const o of nodes) if (o) { try { o.stop(now + 0.5); } catch { /* already stopped */ } }
}

interface DriveParams {
  hz: number;      // engine fundamental
  load: number;    // 0..1 throttle
  ratio: number;   // 0..1 speed / topSpeed
  gear: number;
  level: number;   // 0..1 distance gain (1 for the player)
  pan: number;     // -1..1
  tc: number;      // pitch smoothing time constant
  idle: number;    // idle gain multiplier
}

/** Apply one frame of state to a voice (shared by player + traffic). */
function driveVoice(ac: AudioContext, v: Voice, p: DriveParams): void {
  const t = TIMBRES[v.flavor], c = CHARACTER[v.flavor];
  const now = ac.currentTime;
  const rev = clamp01((p.hz - t.baseHz) / Math.max(1, t.topHz - t.baseHz));
  const load = clamp01(p.load);

  v.osc1.frequency.setTargetAtTime(p.hz, now, p.tc);
  v.osc2.frequency.setTargetAtTime(p.hz, now, p.tc);
  v.sub.frequency.setTargetAtTime(p.hz / 2, now, p.tc);

  // Brightness: opens with revs + throttle, dulls with distance.
  const cutoff = Math.max(300, (500 + rev * 1800 + load * 1500) * (0.3 + 0.7 * p.level));
  v.filter.frequency.setTargetAtTime(cutoff, now, 0.08);
  // Exhaust resonances glide up a bit with revs.
  v.f1.frequency.setTargetAtTime(c.formants[0] * (0.8 + 0.6 * rev), now, 0.1);
  v.f2.frequency.setTargetAtTime(c.formants[1] * (0.8 + 0.6 * rev), now, 0.1);
  // More input into the shaper under load = more growl.
  v.mix.gain.setTargetAtTime(0.3 + 0.5 * load, now, 0.1);

  // Gear-change torque cut (not on the very first frame).
  const shifted = v.gear >= 0 && v.gear !== p.gear;
  v.gear = p.gear;
  // Lift-off: engine braking is quieter than accelerating.
  const overrun = load < 0.15 && rev > 0.3 ? 0.6 : 1;
  const target = t.baseGain * p.idle * (1 + 0.35 * load) * overrun * p.level * (shifted ? 0.3 : 1);
  v.gain.gain.setTargetAtTime(target, now, shifted ? 0.02 : 0.07);

  v.noiseFilter.frequency.setTargetAtTime(500 + rev * 1500, now, 0.1);
  v.noiseGain.gain.setTargetAtTime(c.noise * (0.25 + 0.75 * load + 0.4 * rev), now, 0.08);

  if (v.whine && v.whineGain) {
    v.whine.frequency.setTargetAtTime(c.whineBase + rev * c.whineSpan, now, 0.08);
    const wl = (1 - c.whineLoad) + c.whineLoad * load;
    v.whineGain.gain.setTargetAtTime(c.whine * wl * (0.3 + 0.7 * rev) * 0.35, now, 0.1);
  }
  // Rough idle fades away as revs climb.
  v.lopeGain.gain.setTargetAtTime(c.lope * (1 - rev), now, 0.2);
  // Keep diesel chug proportional to the (changing) output level.
  if (v.chopGain) v.chopGain.gain.setTargetAtTime(target * t.chopDepth, now, 0.1);

  v.panner.pan.setTargetAtTime(p.pan, now, 0.1);
}

// ---------------------------------------------------------------------------

export interface PlayerEngine {
  kind: VehicleKind; speed: number; topSpeed: number;
  /** 0..1 throttle load (growl). */
  load: number;
  /** False when on foot / paused / idle-off: voice fades out. */
  audible: boolean;
}

export class VehicleAudio {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private player: Voice | null = null;
  private readonly pool = new Map<string, Voice>();
  private skid: { gain: GainNode; bp: BiquadFilterNode } | null = null;
  private road: { gain: GainNode; lp: BiquadFilterNode } | null = null;
  private suspended = false;

  /** Create the context on first audible frame (post-gesture, like other sounds). */
  private ensure(): AudioContext | null {
    try {
      if (!this.ac) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ac = new AC();
        this.master = this.ac.createGain();
        this.master.gain.value = 0.9;
        // Compressor keeps stacked voices from clipping.
        const comp = this.ac.createDynamicsCompressor();
        comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4;
        comp.attack.value = 0.01; comp.release.value = 0.2;
        this.master.connect(comp).connect(this.ac.destination);
        // 2s of white noise shared by every noise source.
        const len = this.ac.sampleRate * 2;
        this.noiseBuf = this.ac.createBuffer(1, len, this.ac.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ac.state === 'suspended' && !this.suspended) void this.ac.resume();
      return this.ac.state === 'suspended' ? null : this.ac;
    } catch { return null; }
  }

  updatePlayer(p: PlayerEngine): void {
    const ac = this.ensure();
    if (!ac || !this.master || !this.noiseBuf) return;
    const flavor = flavorFor(p.kind);
    const timbre = TIMBRES[flavor];
    if (!p.audible) {
      if (this.player) { stopVoice(ac, this.player); this.player = null; }
      this.setRoad(0);
      return;
    }
    if (!this.player || this.player.flavor !== flavor || this.player.stopping) {
      if (this.player) stopVoice(ac, this.player);
      this.player = createVoice(ac, this.master, flavor, this.noiseBuf);
    }
    const ratio = clamp01(Math.abs(p.speed) / Math.max(1, p.topSpeed));
    driveVoice(ac, this.player, {
      hz: rpmHz(p.speed, p.topSpeed, timbre),
      load: p.load, ratio,
      gear: gearFor(p.speed, p.topSpeed, timbre.gears),
      level: 1, pan: 0, tc: 0.06,
      idle: Math.abs(p.speed) < 0.5 ? 0.35 : 1,
    });
    this.setRoad(ratio);
  }

  /**
   * Retarget the traffic pool to whoever is audible this frame.
   * Optional `heading` (radians, forward = (sin h, cos h)) enables stereo
   * panning; if left/right feel swapped in your game, negate the pan below.
   */
  updateTraffic(sources: TrafficSource[], lx: number, lz: number, heading = 0): void {
    const ac = this.ensure();
    if (!ac || !this.master || !this.noiseBuf) return;
    const want = nearestTraffic(sources, lx, lz, TRAFFIC_VOICES);
    const keep = new Set(want.map(w => w.key));
    for (const [key, v] of this.pool) {
      if (!keep.has(key)) { stopVoice(ac, v); this.pool.delete(key); }
    }
    for (const w of want) {
      const flavor = flavorFor(w.kind);
      const timbre = TIMBRES[flavor];
      let v = this.pool.get(w.key);
      if (!v || v.flavor !== flavor || v.stopping) {
        if (v) { stopVoice(ac, v); this.pool.delete(w.key); }
        v = createVoice(ac, this.master, flavor, this.noiseBuf);
        this.pool.set(w.key, v);
      }
      const spec = VEHICLES[w.kind];
      const ratio = clamp01(Math.abs(w.speed) / Math.max(1, spec.topSpeed));
      const rel = Math.atan2(w.x - lx, w.z - lz) - heading;
      // Fade the pan toward center when very close so it doesn't flip violently.
      const pan = Math.sin(rel) * clamp01(w.dist / 8) * 0.8;
      driveVoice(ac, v, {
        hz: rpmHz(w.speed, spec.topSpeed, timbre),
        load: ratio > 0.05 ? 0.4 : 0, ratio,
        gear: gearFor(w.speed, spec.topSpeed, timbre.gears),
        level: gainFromDistance(w.dist) * 0.7, pan, tc: 0.09,
        idle: 1,
      });
    }
  }

  /** Tire + wind roar for the player, scales with speed. */
  private setRoad(ratio: number): void {
    const ac = this.ac;
    if (!ac || !this.master || !this.noiseBuf) return;
    if (!this.road) {
      const src = ac.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 400; lp.Q.value = 0.5;
      const gain = ac.createGain(); gain.gain.value = 0;
      src.connect(lp).connect(gain).connect(this.master);
      src.start();
      this.road = { gain, lp };
    }
    const now = ac.currentTime;
    this.road.gain.gain.setTargetAtTime(0.07 * ratio * ratio, now, 0.15);
    this.road.lp.frequency.setTargetAtTime(300 + ratio * 1200, now, 0.15);
  }

  /** Tire screech while sliding (shares the skid-mark trigger). */
  setSkid(on: boolean, intensity = 1): void {
    const ac = this.ensure();
    if (!ac || !this.master || !this.noiseBuf) return;
    if (!this.skid) {
      const src = ac.createBufferSource();
      src.buffer = this.noiseBuf; src.loop = true;
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 6; // narrower = more "squeal"
      const gain = ac.createGain(); gain.gain.value = 0;
      src.connect(bp).connect(gain).connect(this.master);
      src.start();
      this.skid = { gain, bp };
    }
    const k = clamp01(intensity), now = ac.currentTime;
    this.skid.bp.frequency.setTargetAtTime(1100 + k * 1100, now, 0.1);
    this.skid.gain.gain.setTargetAtTime(on ? 0.12 * k : 0, now, on ? 0.05 : 0.12);
  }

  setSuspended(s: boolean): void {
    this.suspended = s;
    if (!this.ac) return;
    if (s) void this.ac.suspend();
    else if (this.ac.state === 'suspended') void this.ac.resume();
  }

  dispose(): void {
    if (this.ac) {
      if (this.player) stopVoice(this.ac, this.player);
      for (const v of this.pool.values()) stopVoice(this.ac, v);
      this.player = null; this.pool.clear(); this.skid = null; this.road = null;
      void this.ac.close().catch(() => undefined);
      this.ac = null; this.master = null; this.noiseBuf = null;
    }
  }
}