import { WORLD, type Course } from '../game/State';
const CHAPTERS = [
  ['THE FIRST REP', 'Every strong story starts with a small step.'],
  ['BUILT, NOT BORN', 'A little resistance. A little more you.'],
  ['UNDER PRESSURE', 'Find your rhythm. Make your own way.'],
  ['HARDER TO BREAK', 'The path gets harder. So do you.'],
];
/** Curated spacing keeps the required gaps within the minimum jump range. */
export function createCourse(level: number): Course {
  const extra = Math.min(3, Math.floor((level - 1) / 2));
  const width = 3500 + extra * 650;
  const ground = WORLD.ground;
  const pits = [{ x: 1500, w: 145 }, { x: 2570, w: 155 }];
  for (let i = 0; i < extra; i++) pits.push({ x: 3300 + i * 650, w: 150 });
  const platforms: Course['platforms'] = [];
  let start = 0;
  for (const pit of pits) {
    platforms.push({ x: start, y: ground, w: pit.x - start, h: 200 });
    start = pit.x + pit.w;
  }
  platforms.push({ x: start, y: ground, w: width - start, h: 200 });
  const wallHp = 2 + Math.floor((level - 1) / 3);
  const hazards: Course['hazards'] = [
    { kind: 'spikes', x: 640, y: ground - 30, w: 85, h: 30, offset: 0 },
    { kind: 'saw', x: 1250, y: ground - 56, w: 48, h: 48, offset: 0.5 },
    { kind: 'crusher', x: 1970, y: 140, w: 90, h: 150, offset: 0 },
    { kind: 'spikes', x: 2360, y: ground - 30, w: 90, h: 30, offset: 0 },
    { kind: 'saw', x: 2870, y: ground - 60, w: 48, h: 48, offset: 1.8 },
  ];
  for (let i = 0; i < extra; i++) hazards.push({ kind: i % 2 ? 'crusher' : 'saw',
    x: 3070 + i * 650, y: i % 2 ? 140 : ground - 60,
    w: i % 2 ? 90 : 48, h: i % 2 ? 150 : 48, offset: i });
  const chapter = CHAPTERS[(level - 1) % CHAPTERS.length];
  return {
    width, name: chapter[0], subtitle: chapter[1], platforms, hazards,
    walls: [980, 2210].map(x => ({ x, y: ground - 108, w: 46, h: 108, hp: wallHp, maxHp: wallHp })),
    pickups: [400, 680, 1110, 1568, 1790, 2420, 2650, 3050].map((x, index) =>
      ({ x, y: ground - ([1, 3, 5, 6].includes(index) ? 140 : 65), collected: false })),
    checkpoints: [1770], finish: width - 190,
  };
}
export function physique(level: number): { name: string; muscle: number; strength: number } {
  // Visual growth approaches a safe maximum; the collision hull stays consistent.
  return { name: level < 3 ? 'ROOKIE' : level < 6 ? 'ATHLETE' : level < 10 ? 'POWERHOUSE' : 'TITAN',
    muscle: 1 - Math.exp(-(level - 1) / 7), strength: level };
}
