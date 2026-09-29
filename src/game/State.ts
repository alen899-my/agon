export type Theme = 'light' | 'dark' | 'color';
export type Action = 'left' | 'right' | 'jump' | 'punch';
export type Phase = 'ready' | 'playing' | 'complete' | 'defeat';
export const WORLD = { viewWidth: 1280, viewHeight: 720, ground: 520 } as const;
export interface Rect { x: number; y: number; w: number; h: number }
export interface Hazard extends Rect { kind: 'spikes' | 'saw' | 'crusher'; offset: number }
export interface Wall extends Rect { hp: number; maxHp: number }
export interface Pickup { x: number; y: number; collected: boolean }
export interface Course {
  width: number; name: string; subtitle: string; platforms: Rect[];
  hazards: Hazard[]; walls: Wall[]; pickups: Pickup[]; checkpoints: number[]; finish: number;
}
export interface Snapshot {
  level: number; phase: Phase; paused: boolean; health: number;
  progress: number; strength: number; physique: string; gains: number;
  checkpoint: boolean; time: number; title: string; subtitle: string;
}
