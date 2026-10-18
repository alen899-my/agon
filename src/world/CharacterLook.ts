export const TOPS = ['T-shirt', 'Hoodie', 'Bomber', 'Denim jacket', 'Leather jacket', 'Blazer', 'Parka', 'Tank top', 'Polo', 'Racing suit', 'Varsity jacket', 'Work shirt'] as const;
export const BOTTOMS = ['Jeans', 'Cargo pants', 'Joggers', 'Shorts', 'Skirt', 'Tailored pants'] as const;
export const HAIR = ['Short', 'Buzz cut', 'Bob', 'Long', 'Ponytail', 'Afro', 'Mohawk', 'Bald'] as const;
export const HATS = ['None', 'Cap', 'Beanie', 'Helmet'] as const;
export const SHOES = ['Sneakers', 'Boots', 'High tops', 'Dress shoes'] as const;
export interface CharacterLook { gender: 'Man' | 'Woman' | 'Nonbinary'; top: string; bottom: string; hair: string; hat: string; shoes: string; skin: string; hairColor: string; topColor: string; bottomColor: string; shoeColor: string; accent: string; glasses: boolean; backpack: boolean }
export const DEFAULT_LOOK: CharacterLook = { gender: 'Man', top: 'Hoodie', bottom: 'Jeans', hair: 'Short', hat: 'None', shoes: 'Sneakers', skin: '#b98160', hairColor: '#251e1a', topColor: '#526a58', bottomColor: '#263448', shoeColor: '#e5e2da', accent: '#dfbf65', glasses: false, backpack: false };
export function readCharacterLook(): CharacterLook {
  try { const v = JSON.parse(localStorage.getItem('agon-character') ?? 'null'); if (!v || typeof v !== 'object') return { ...DEFAULT_LOOK };
    const look = { ...DEFAULT_LOOK };
    const choices = { gender: ['Man', 'Woman', 'Nonbinary'], top: TOPS, bottom: BOTTOMS, hair: HAIR, hat: HATS, shoes: SHOES };
    for (const [key, values] of Object.entries(choices)) if ((values as readonly unknown[]).includes(v[key])) Object.assign(look, { [key]: v[key] });
    for (const key of ['skin', 'hairColor', 'topColor', 'bottomColor', 'shoeColor', 'accent']) if (typeof v[key] === 'string' && /^#[0-9a-f]{6}$/i.test(v[key])) Object.assign(look, { [key]: v[key] });
    look.glasses = v.glasses === true; look.backpack = v.backpack === true; return look;
  } catch { return { ...DEFAULT_LOOK }; }
}
export const OUTFITS = TOPS.flatMap((top, i) => ['City', 'Night', 'Weekend', 'Track'].map((edition, j) => ({
  name: `${edition} ${top}`,
  look: {
    top, bottom: BOTTOMS[(i + j) % BOTTOMS.length], shoes: SHOES[j],
    hair: HAIR[(i * 2 + j) % HAIR.length], hat: HATS[(i + j) % HATS.length],
    glasses: (i + j) % 3 === 0, backpack: (i + j) % 2 === 1,
    topColor: ['#65775b', '#232831', '#bd694f', '#d8d9cf'][j],
    bottomColor: ['#30465b', '#191e25', '#c4ad85', '#3a434b'][j],
    shoeColor: ['#e5e2da', '#4a3527', '#f1efe8', '#1a1a1c'][j],
    accent: ['#e3c585', '#a8b8cd', '#f2ddd2', '#e8b529'][j],
  },
})));
