import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { WEATHER_GRIP, WEATHER_PRESETS, WeatherParticles, wrapCoord } from './Weather';
import { AssetKit } from './Assets';
import { LAMPS } from './Map';
import { Simulation } from './Simulation';

describe('weather presets', () => {
  it('defines dry / wet / snow grip steps', () => {
    expect(WEATHER_GRIP.normal).toBe(1);
    expect(WEATHER_GRIP.rain).toBe(0.85);
    expect(WEATHER_GRIP.snow).toBe(0.7);
    expect(WEATHER_PRESETS.rain.grip).toBe(0.85);
    expect(WEATHER_PRESETS.snow.grip).toBe(0.7);
  });
  it('closes fog in for precipitation and flags a full snow blanket', () => {
    expect(WEATHER_PRESETS.rain.fogFar).toBeLessThan(280);
    expect(WEATHER_PRESETS.snow.snowBlanket).toBe(true);
    expect(WEATHER_PRESETS.normal.snowBlanket).toBe(false);
    expect(WEATHER_PRESETS.rain.roadRoughness).toBeLessThan(1);
  });
  it('makes rainy nights the darkest compose', () => {
    expect(WEATHER_PRESETS.rain.nightDarken).toBeGreaterThan(WEATHER_PRESETS.snow.nightDarken);
  });
});

describe('wrapCoord', () => {
  it('wraps values into the camera-following box', () => {
    expect(wrapCoord(45, 0, 44)).toBeCloseTo(1, 6);
    expect(wrapCoord(-3, 0, 44)).toBeCloseTo(41, 6);
    expect(wrapCoord(22, 0, 44)).toBeCloseTo(22, 6);
  });
});

describe('WeatherParticles', () => {
  it('stays hidden on clear and shows the right system per mode', () => {
    const scene = new THREE.Scene();
    const p = new WeatherParticles(scene);
    p.setQuality('low');
    expect(p.particleCount).toBe(150);
    p.setSeason('summer');
    p.setWeather('normal');
    expect(p.active).toBe(false);
    expect(p.group.visible).toBe(false);
    p.setWeather('rain');
    expect(p.active).toBe(true);
    p.setWeather('snow');
    expect(p.current).toBe('snow');
    p.dispose();
  });
  it('falls rain downward and wraps flakes inside the box', () => {
    const scene = new THREE.Scene();
    const p = new WeatherParticles(scene);
    p.setQuality('low');
    p.setWeather('rain');
    p.snapTo(0, 0);
    const before = (p as unknown as { rainPos: Float32Array }).rainPos.slice();
    p.update(0.05, 0, 0);
    const after = (p as unknown as { rainPos: Float32Array }).rainPos;
    let moved = 0;
    for (let i = 0; i < before.length; i += 6) if (after[i + 1] !== before[i + 1]) moved++;
    expect(moved).toBeGreaterThan(0);
    // Every drop stays inside the 30m-tall box.
    for (let i = 0; i < after.length; i += 6) {
      expect(after[i + 1]).toBeGreaterThanOrEqual(0);
      expect(after[i + 1]).toBeLessThanOrEqual(30);
    }
    p.dispose();
  });
});

describe('night glow registry', () => {
  it('ships warm lamp + lit-window materials and a lamp anchor per post', () => {
    const kit = new AssetKit();
    expect(kit.materials.lampGlow).toBeDefined();
    expect(kit.materials.windowLit).toBeDefined();
    expect(kit.materials.lampGlow.emissive.getHex()).toBe(0xffb45e);
    expect(LAMPS.length).toBeGreaterThan(0);
    kit.dispose();
  });
});

describe('weather grip (snow brakes longer)', () => {
  const drive = () => {
    const sim = new Simulation();
    sim.begin();
    sim.x = sim.car.x = 0; sim.z = sim.car.z = 40;
    sim.traffic = []; sim.peds = []; sim.parked = [];
    sim.interact(); sim.transition = 0;
    return sim;
  };
  it('exposes the grip multiplier and snapshots the mode', () => {
    const sim = drive();
    expect(sim.weatherGrip).toBe(1);
    sim.weather = 'snow';
    expect(sim.weatherGrip).toBe(0.7);
    expect(sim.snapshot.weather).toBe('snow');
  });
  it('slides more and brakes longer on snow than on dry asphalt', () => {
    const dry = drive(), snow = drive();
    snow.weather = 'snow';
    // Lateral slide: same speed + steer, handbrake held.
    for (const sim of [dry, snow]) { sim.car.speed = 18; sim.setInput('right', true, 'd'); sim.setInput('handbrake', true, 'space'); }
    for (let i = 0; i < 24; i++) { dry.update(1 / 60); snow.update(1 / 60); }
    expect(Math.abs(snow.lateralSpeed)).toBeGreaterThan(Math.abs(dry.lateralSpeed));
    // Braking: opposing input from speed bleeds off slower on snow.
    const dryB = drive(), snowB = drive();
    snowB.weather = 'snow';
    for (const sim of [dryB, snowB]) { sim.car.speed = 20; sim.setInput('back', true, 's'); }
    for (let i = 0; i < 30; i++) { dryB.update(1 / 60); snowB.update(1 / 60); }
    expect(snowB.car.speed).toBeGreaterThan(dryB.car.speed);
  });
});
