export interface Point { x: number; z: number }
export interface Box extends Point { w: number; d: number; h: number }
export interface Building extends Box { kind: 'apartment' | 'shop' | 'warehouse' | 'station'; shade: number; name?: string }
export interface Place extends Point { id: string; name: string; category: string; description: string }
export const LIMIT = 112;
export const ROADS = [-80, 0, 80];
export const PLACES: Place[] = [
  { id: 'plaza', name: 'Civic Square', category: 'PUBLIC SPACE', x: -27, z: 23, description: 'A quiet square at the heart of the district.' },
  { id: 'market', name: 'Market Street', category: 'SHOPS & CAFÉS', x: 22, z: -12, description: 'Small storefronts, long sidewalks, familiar faces.' },
  { id: 'park', name: 'North Gardens', category: 'PARK', x: 44, z: -48, description: 'A little room to breathe between the buildings.' },
  { id: 'homes', name: 'The Residences', category: 'NEIGHBORHOOD', x: -42, z: -27, description: 'Apartment blocks around a shared courtyard.' },
  { id: 'station', name: 'South Station', category: 'TRANSIT', x: 42, z: 27, description: 'The beginning of a journey. Platforms open to the sky.' },
  { id: 'works', name: 'The Foundry', category: 'INDUSTRIAL', x: -45, z: 65, description: 'Old workshops at the edge of the neighborhood.' },
];

export function buildings(): Building[] {
  const result: Building[] = [];
  const add = (x: number, z: number, w: number, d: number, h: number, kind: Building['kind'], shade: number, name?: string) => result.push({ x, z, w, d, h, kind, shade, name });
  add(-26, -48, 19, 19, 22, 'apartment', 0, '01');
  add(-53, -49, 19, 25, 31, 'apartment', 1, '02');
  add(-58, -20, 14, 13, 14, 'apartment', 2, '03');
  add(24, -22, 17, 13, 8, 'shop', 1, 'COFFEE');
  add(47, -20, 19, 13, 10, 'shop', 0, 'MARKET');
  add(65, -45, 9, 24, 14, 'apartment', 2);
  add(39, 44, 29, 17, 11, 'station', 1, 'SOUTH STATION');
  add(64, 60, 11, 17, 16, 'apartment', 0);
  add(-45, 53, 30, 18, 12, 'warehouse', 2, 'FOUNDRY');
  add(-65, 28, 12, 18, 8, 'warehouse', 1);
  // Perimeter blocks reuse the same three facade families.
  for (let i = 0; i < 4; i++) {
    const x = [-52, -27, 27, 52][i];
    add(x, -101, 20, 14, 12 + (i % 3) * 7, i % 2 ? 'shop' : 'apartment', i % 3);
    add(x, 101, 20, 14, 10 + (i % 3) * 5, 'apartment', (i + 1) % 3);
  }
  for (const x of [-101, 101]) for (const z of [-48, -18, 22, 54]) add(x, z, 14, 18, 12 + Math.abs(z) % 17, 'apartment', Math.abs(z) % 3);
  return result;
}
export const BUILDINGS = buildings();
export const SOLIDS: Box[] = [...BUILDINGS,
  { x: -27, z: 23, w: 4, d: 4, h: 2.5 },
  { x: 43, z: -48, w: 7, d: 7, h: 0.8 },
];

export function intersects(x: number, z: number, radius: number, boxes: readonly Box[] = SOLIDS): boolean {
  return boxes.some(box => {
    const cx = Math.max(box.x - box.w / 2, Math.min(x, box.x + box.w / 2));
    const cz = Math.max(box.z - box.d / 2, Math.min(z, box.z + box.d / 2));
    return (x - cx) ** 2 + (z - cz) ** 2 < radius ** 2;
  });
}
export function seeded(seed: number): () => number {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
}
