import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOTTOMS, DEFAULT_LOOK, HAIR, HATS, OUTFITS, SHOES, TOPS, readCharacterLook } from './CharacterLook';

const HEX = /^#[0-9a-f]{6}$/i;
const stubStorage = (data: unknown) => vi.stubGlobal('localStorage', { getItem: () => (data === undefined ? null : JSON.stringify(data)), setItem: () => {} });
afterEach(() => vi.unstubAllGlobals());

describe('outfit presets', () => {
  it('ships 48 uniquely named looks covering every wardrobe category', () => {
    expect(OUTFITS).toHaveLength(48);
    expect(new Set(OUTFITS.map(outfit => outfit.name)).size).toBe(48);
    for (const { look } of OUTFITS) {
      expect(TOPS).toContain(look.top);
      expect(BOTTOMS).toContain(look.bottom);
      expect(SHOES).toContain(look.shoes);
      expect(HAIR).toContain(look.hair);
      expect(HATS).toContain(look.hat);
      expect(typeof look.glasses).toBe('boolean');
      expect(typeof look.backpack).toBe('boolean');
      for (const color of [look.topColor, look.bottomColor, look.shoeColor, look.accent]) expect(color).toMatch(HEX);
    }
  });

  it('mixes every top, bottom, shoe, hat and hair style across the set', () => {
    expect(new Set(OUTFITS.map(outfit => outfit.look.top)).size).toBe(TOPS.length);
    expect(new Set(OUTFITS.map(outfit => outfit.look.bottom)).size).toBe(BOTTOMS.length);
    expect(new Set(OUTFITS.map(outfit => outfit.look.shoes)).size).toBe(SHOES.length);
    expect(new Set(OUTFITS.map(outfit => outfit.look.hat)).size).toBe(HATS.length);
    expect(new Set(OUTFITS.map(outfit => outfit.look.hair)).size).toBe(HAIR.length);
    expect(OUTFITS.some(outfit => outfit.look.glasses)).toBe(true);
    expect(OUTFITS.some(outfit => outfit.look.backpack)).toBe(true);
  });

  it('never locks a gender so every preset fits every body', () => {
    for (const { look } of OUTFITS) expect('gender' in look).toBe(false);
  });
});

describe('saved character look', () => {
  it('falls back to defaults for unknown or malformed saves', () => {
    stubStorage({ gender: 'Wizard', top: 'Armour', bottom: 'Kilt', hair: 'Mullet', hat: 'Crown', shoes: 'Crocs', skin: 'red', glasses: 'yes', backpack: 1 });
    expect(readCharacterLook()).toEqual(DEFAULT_LOOK);
  });

  it('round-trips valid independent choices for any gender', () => {
    const chosen = { ...DEFAULT_LOOK, gender: 'Woman', top: 'Tank top', bottom: 'Cargo pants', hair: 'Mohawk', hat: 'Helmet', shoes: 'Boots', glasses: true, backpack: true, skin: '#123456' };
    stubStorage(chosen);
    expect(readCharacterLook()).toEqual(chosen);
  });

  it('survives storage being unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(readCharacterLook()).toEqual(DEFAULT_LOOK);
  });
});
