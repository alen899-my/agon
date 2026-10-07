import { walkPath } from './navigation.js';
import { dialogueLines, type DialogueGenerator } from './dialogueTypes.js';
import { racePathAt, racePathLength } from './racePath.js';
/** Pure deterministic world rules, also embedded by the offline client. No IO. */
export type WalkerRole =
  | 'police' | 'builder' | 'medic' | 'vendor' | 'resident'
  | 'racer' | 'jogger' | 'kid' | 'guard' | 'photo' | 'mechanic'
  | 'dancer' | 'drifter' | 'elder';
export interface Appearance { shirt: number; pants: number; skin: number; hat?: 'cap' | 'helmet' | 'none'; vest?: boolean; apron?: boolean }
export const OUTFITS: Record<WalkerRole, Appearance> = {
  police: { shirt: 0x203c69, pants: 0x17243b, skin: 0xbe8864, hat: 'cap' },
  builder: { shirt: 0xee792f, pants: 0x394957, skin: 0x986748, hat: 'helmet', vest: true },
  medic: { shirt: 0xf3f2e9, pants: 0x244954, skin: 0xdba680, hat: 'cap' },
  vendor: { shirt: 0x50865b, pants: 0x343a32, skin: 0xac7757, apron: true },
  resident: { shirt: 0x9672ab, pants: 0x364860, skin: 0xd2a080 },
  racer: { shirt: 0xd21f26, pants: 0x1c1e22, skin: 0xe0b18b, hat: 'cap' },
  jogger: { shirt: 0x00e5ff, pants: 0x1c1e22, skin: 0xdba680, hat: 'none' },
  kid: { shirt: 0xff5d8f, pants: 0x2456c8, skin: 0xe0b18b, hat: 'none' },
  guard: { shirt: 0x3a3a3a, pants: 0x1c1e22, skin: 0xbe8864, hat: 'cap', vest: true },
  photo: { shirt: 0xf2b705, pants: 0x2456c8, skin: 0xe0b18b, hat: 'none' },
  mechanic: { shirt: 0x5a6268, pants: 0x1c1e22, skin: 0x865b40, hat: 'cap' },
  dancer: { shirt: 0xff007f, pants: 0xf5f5f5, skin: 0xe0b18b, hat: 'none' },
  drifter: { shirt: 0x111318, pants: 0x111318, skin: 0xbe8864, hat: 'none' },
  elder: { shirt: 0x6a4c93, pants: 0x2b2d42, skin: 0x865b40, hat: 'none' },
};
/** The 20-agent living-world roster: id, name, role, home turf. */
export interface RosterEntry { id: string; name: string; role: WalkerRole; home: { x: number; z: number } }
export const ROSTER20: readonly RosterEntry[] = [
  { id: 'w-00', name: 'Vikram', role: 'police', home: { x: 42, z: 27 } },
  { id: 'w-01', name: 'Rosa', role: 'police', home: { x: 22, z: -12 } },
  { id: 'w-02', name: 'Ravi', role: 'builder', home: { x: -45, z: 65 } },
  { id: 'w-03', name: 'Suresh', role: 'builder', home: { x: -45, z: 65 } },
  { id: 'w-04', name: 'Kiran', role: 'builder', home: { x: -45, z: 65 } },
  { id: 'w-05', name: 'Aisha', role: 'medic', home: { x: 22, z: -12 } },
  { id: 'w-06', name: 'Maya', role: 'racer', home: { x: -45, z: 82 } },
  { id: 'w-07', name: 'Leo', role: 'racer', home: { x: -45, z: 82 } },
  { id: 'w-08', name: 'Budi', role: 'vendor', home: { x: 22, z: -12 } },
  { id: 'w-09', name: 'Sari', role: 'vendor', home: { x: -27, z: 23 } },
  { id: 'w-10', name: 'Tan', role: 'elder', home: { x: 30, z: 99 } },
  { id: 'w-11', name: 'Jon', role: 'jogger', home: { x: -27, z: 23 } },
  { id: 'w-12', name: 'Kim', role: 'jogger', home: { x: -27, z: 23 } },
  { id: 'w-13', name: 'Pak Guard', role: 'guard', home: { x: 108, z: -95 } },
  { id: 'w-14', name: 'Mei', role: 'photo', home: { x: 104, z: -122 } },
  { id: 'w-15', name: 'Adi', role: 'kid', home: { x: -27, z: 23 } },
  { id: 'w-16', name: 'Nia', role: 'kid', home: { x: -27, z: 23 } },
  { id: 'w-17', name: 'Tukang', role: 'mechanic', home: { x: 42, z: 27 } },
  { id: 'w-18', name: 'Dara', role: 'dancer', home: { x: -21, z: 24 } },
  { id: 'w-19', name: 'Ghost', role: 'drifter', home: { x: -45, z: 82 } },
];
export interface BuiltBox { x: number; z: number; w: number; d: number; h: number }
export interface BuildSite extends BuiltBox { id: string; stage: number; progress: number }
export interface BuildDelta { siteId: string; stage: number; box: BuiltBox }
// Small infill lots, outside road clearance, canal, sports courts and existing solids.
export const BUILD_LOTS: readonly BuiltBox[] = [
  { x: 64, z: 23, w: 6, d: 6, h: 8 },
  { x: -48, z: 20, w: 8, d: 8, h: 8 },
];
export interface PedAgent {
  id: string; role: WalkerRole; name: string; outfit: Appearance;
  x: number; z: number; yaw: number; speed: number; task: string;
  say?: string; chatUntil: number;
  /** True while the walker is inside a vehicle (racers) — renderer hides the body. */
  hidden?: boolean;
}
interface Walker extends PedAgent { homeX: number; homeZ: number; work: number; nextChat: number }
interface Conversation { a: string; b: string; started: number; lines: readonly string[]; turn: number; ready: boolean }
/** One street-racer ride on the Grand Circuit (Maya vs Leo). */
export interface RideState {
  id: string; name: string; kind: string; x: number; z: number; yaw: number;
  speed: number; lap: number; state: 'countdown' | 'racing' | 'cooldown'; countdownT: number;
  dist: number;
  steer?: number; braking?: boolean;
}
/** LLM directives consumed by the tick (event-driven, cached — never per-second). */
export interface WorldDirectives { siteFocus?: string; raceNow?: boolean }
/** Photo tour landmarks. */
const PHOTO_SPOTS: readonly { x: number; z: number }[] = [
  { x: 104, z: -116 }, { x: 33, z: 99 }, { x: 98, z: -98 }, { x: -45, z: 82 },
];
export interface Incident { id: string; x: number; z: number; until: number; treated: boolean }
export interface WorldInput {
  cops: readonly { x: number; z: number; pursuing: boolean }[];
  members: readonly { x: number; z: number }[];
  blocked?: (x: number, z: number) => boolean;
}
export class ConstructionDirector {
  readonly sites: BuildSite[] = BUILD_LOTS.map((b, i) => ({ ...b, id: `lot-${i + 1}`, stage: 0, progress: 0 }));
  private deltas: BuildDelta[] = [];
  restore(rows: readonly { siteId: string; stage: number }[]): void {
    for (const row of rows) {
      const site = this.sites.find(s => s.id === row.siteId);
      if (site && Number.isInteger(row.stage) && row.stage > site.stage && row.stage <= 4) {
        site.stage = row.stage; site.progress = 0;
      }
    }
  }
  build(site: BuildSite, dt: number, occupied: boolean): void {
    if (site.stage >= 4) return;
    site.progress = Math.min(1, site.progress + dt / 16);
    if (site.progress < 1 || occupied) return;
    site.stage++; site.progress = 0;
    this.deltas.push({ siteId: site.id, stage: site.stage, box: siteBox(site) });
  }
  drainDeltas(): BuildDelta[] { return this.deltas.splice(0); }
}
export function siteBox(site: BuildSite): BuiltBox {
  return { x: site.x, z: site.z, w: site.w, d: site.d, h: site.h * site.stage / 4 };
}
export class LivingWorld {
  dialogue?: DialogueGenerator;
  private disposed = false;
  private nextDialogue = 0;
  private dialogueNow = 0;
  private dialogueMemory = new Map<string, string[]>();
  dispose(): void { this.disposed = true; this.conversations = []; }
  readonly construction = new ConstructionDirector();
  readonly blackboard = {
    agents: new Map<string, Walker>(), sites: this.construction.sites,
    incidents: new Map<string, Incident>(), claims: new Map<string, string>(),
  };
  private incidentSeq = 0;
  private readonly paths = new Map<string, { x: number; z: number; points: { x: number; z: number }[]; retry: number }>();
  private positioned = false;
  private conversations: Conversation[] = [];
  private photoStop = 0;
  private photoUntil = 0;
  private tagger = 'w-15';
  private tagAfter = 0;
  readonly rides: RideState[] = [];
  readonly directives: WorldDirectives = {};
  private raceCooldownUntil = 0;
  constructor() {
    ROSTER20.forEach((entry, i) => {
      // Builders muster by the first lot; everyone else starts at home.
      const site = this.blackboard.sites[Math.max(0, i - 2) % 2];
      const neighborIndex = ROSTER20.slice(0, i).filter(p => p.home.x === entry.home.x && p.home.z === entry.home.z).length;
      const x = entry.role === 'builder' ? site.x - 7 : entry.home.x + (neighborIndex - 1) * 1.6;
      const z = entry.role === 'builder' ? site.z + 6 + (i % 3) * 2 : entry.home.z;
      this.blackboard.agents.set(entry.id, {
        id: entry.id, role: entry.role, name: entry.name,
        outfit: { ...OUTFITS[entry.role], skin: [0xbe8864, 0x865b40, 0xe0b18b][i % 3] },
        x, z, homeX: x, homeZ: z, yaw: 0, speed: 0, task: 'idle', work: 0, chatUntil: 0, nextChat: 0,
      });
    });
  }
  incident(x: number, z: number, now: number): void {
    if (this.blackboard.incidents.size >= 16) return;
    const id = `incident-${++this.incidentSeq}`;
    this.blackboard.incidents.set(id, { id, x, z, until: now + 30_000, treated: false });
  }
  snapshot(): PedAgent[] {
    return [...this.blackboard.agents.values()].map(({ homeX, homeZ, work, nextChat, ...p }) => ({ ...p, outfit: { ...p.outfit } }));
  }
  tick(dt: number, now: number, input: WorldInput): void {
    this.dialogueNow = now;
    const b = this.blackboard;
    // Landmarks are solids: place people beside them, never inside a statue.
    if (!this.positioned) {
      for (const a of b.agents.values()) {
        if (!input.blocked?.(a.x, a.z)) continue;
        let found = false;
        for (let radius = 1; radius <= 12 && !found; radius++) for (let i = 0; i < 16; i++) {
          const x = a.x + Math.cos(i * Math.PI / 8) * radius;
          const z = a.z + Math.sin(i * Math.PI / 8) * radius;
          if (!input.blocked(x, z)) { a.x = a.homeX = x; a.z = a.homeZ = z; found = true; break; }
        }
      }
      this.positioned = true;
    }
    for (const [id, incident] of b.incidents) if (now >= incident.until || incident.treated) { b.incidents.delete(id); b.claims.delete(id); }
    const talking = this.tickConversations(now, input);
    for (const a of b.agents.values()) {
      if (a.chatUntil <= now) a.say = undefined;
      if (talking.has(a.id)) continue;
      let tx = a.homeX, tz = a.homeZ, speed = 1.4;
      a.task = a.task === 'fetch' || a.task === 'build' ? a.task : 'idle';
      if (a.role === 'builder') {
        let site = b.sites.find(s => b.claims.get(s.id) === a.id && s.stage < 4);
        if (!site) {
          // LLM directive (siteFocus) steers the crew; otherwise first open lot.
          site = b.sites.find(s => s.id === this.directives.siteFocus && s.stage < 4 && !b.claims.has(s.id))
            ?? b.sites.find(s => s.stage < 4 && !b.claims.has(s.id));
          if (site) { b.claims.set(site.id, a.id); a.task = 'fetch'; }
        }
        if (site) {
          tx = site.x - site.w / 2 - 1; tz = site.z + (a.task === 'fetch' ? 7 : 0);
          if (Math.hypot(a.x - tx, a.z - tz) < 0.5) {
            if (a.task === 'fetch') { a.work += dt; if (a.work >= 2) { a.task = 'build'; a.work = 0; } }
            else {
              const occupied = [...input.members, ...input.cops, ...b.agents.values()].some(p => Math.abs(p.x - site!.x) < site!.w / 2 + 1 && Math.abs(p.z - site!.z) < site!.d / 2 + 1);
              const before = site.stage;
              this.construction.build(site, dt, occupied);
              if (site.stage !== before) { a.task = 'fetch';  }
              if (site.stage === 4) { b.claims.delete(site.id); a.task = 'idle'; }
            }
          }
        } else { a.task = 'idle'; }
      } else if (a.role === 'medic') {
        const incident = [...b.incidents.values()].find(v => !v.treated && (!b.claims.has(v.id) || b.claims.get(v.id) === a.id));
        if (incident) {
          b.claims.set(incident.id, a.id); tx = incident.x; tz = incident.z; speed = 2.8; a.task = 'respond';
          if (Math.hypot(tx - a.x, tz - a.z) < 2) { a.work += dt; a.task = 'treat';  if (a.work >= 3) { incident.treated = true; a.work = 0; } }
        } else a.work = 0;
      } else if (a.role === 'police') {
        const site = b.sites.find(s => s.stage < 4 && input.members.some(p => Math.abs(p.x - s.x) < s.w / 2 + 1 && Math.abs(p.z - s.z) < s.d / 2 + 1));
        if (site) { tx = site.x - site.w / 2 - 2; tz = site.z; a.task = 'guard';  }
        else { tx += Math.sin(now / 8000) * 3; a.task = 'patrol'; }
      } else if (a.role === 'racer') {
        // Maya & Leo lounge at the paddock until a race is called, then drive.
        const racing = this.rides.length > 0;
        a.hidden = racing || undefined;
        if (racing) { a.task = 'race'; tx = a.x; tz = a.z; speed = 0; }
        else {
          tx = a.homeX + (a.id === 'w-06' ? -2 : 2); tz = a.homeZ + 2; speed = 1.4; a.task = 'idle';
        }
      } else if (a.role === 'jogger') {
        // Park loops with overtakes.
        const t = now / 1000;
        const r = 10 + (a.id === 'w-12' ? 2 : 0);
        tx = a.homeX + Math.cos(t * 0.25 + (a.id === 'w-12' ? Math.PI : 0)) * r;
        tz = a.homeZ + Math.sin(t * 0.25 + (a.id === 'w-12' ? Math.PI : 0)) * r;
        speed = 2.6; a.task = 'jog';
        const peer = b.agents.get(a.id === 'w-11' ? 'w-12' : 'w-11');
        if (peer && Math.hypot(peer.x - a.x, peer.z - a.z) < 3 && now >= a.nextChat) {
          speed = 3.4; 
        }
      } else if (a.role === 'kid') {
        // Tag around the plaza: 'it' chases, tag swaps on touch.
        const other = b.agents.get(a.id === 'w-15' ? 'w-16' : 'w-15');
        const it = a.id === this.tagger;
        if (other && it) {
          tx = other.x; tz = other.z; speed = 3.2; a.task = 'it';
          if (now >= this.tagAfter && Math.hypot(a.x - other.x, a.z - other.z) < 1.2) {
            this.tagger = other.id; this.tagAfter = now + 2500;
            a.task = 'idle'; other.task = 'it';
             
          }
        } else if (other) {
          const d = Math.hypot(a.x - other.x, a.z - other.z) || 1;
          tx = a.x + (a.x - other.x || 1) / d * 8; tz = a.z + (a.z - other.z) / d * 8;
          // Stay near the plaza, don't run into traffic.
          if (Math.hypot(tx - a.homeX, tz - a.homeZ) > 12) { tx = a.homeX; tz = a.homeZ; }
          speed = 3.0; a.task = 'run';
        }
      } else if (a.role === 'guard') {
        // Harbor pier patrol, shoos intruders (player included).
        const t = now / 1000;
        const intruder = input.members.find(p => Math.hypot(p.x - 108, p.z - -95) < 14);
        if (intruder) {
          tx = intruder.x; tz = intruder.z; speed = 2.2; a.task = 'guard';
        } else {
          tx = 108 + Math.sin(t * 0.2) * 10; tz = -95 + Math.cos(t * 0.13) * 6;
          speed = 1.4; a.task = 'patrol';
        }
      } else if (a.role === 'photo') {
        // Landmark tour with photo stops.
        const spot = PHOTO_SPOTS[this.photoStop];
        tx = spot.x; tz = spot.z; speed = 1.6; a.task = 'walk';
        if (Math.hypot(a.x - spot.x, a.z - spot.z) < 2) {
          tx = a.x; tz = a.z; speed = 0; a.task = 'photo';
          
          if (!this.photoUntil) this.photoUntil = now + 8000;
          if (now >= this.photoUntil) { this.photoStop = (this.photoStop + 1) % PHOTO_SPOTS.length; this.photoUntil = 0; }
        }
      } else if (a.role === 'mechanic') {
        // Station ↔ market tow patrol, chats up nearby drivers.
        tx = a.homeX; tz = a.homeZ; speed = 1.8; a.task = 'walk';
        if (Math.hypot(a.x - tx, a.z - tz) < 1) {
          speed = 0; a.task = Math.floor(now / 10000) % 3 === 2 ? 'rest' : 'repair';
        }
      } else if (a.role === 'dancer') {
        // Fountain-side performance; nearby walkers stop and watch.
        tx = -21; tz = 24; speed = 1.6;
        if (Math.hypot(a.x - tx, a.z - tz) < 1) { tx = a.x; tz = a.z; speed = 0; a.task = 'dance'; }
        else a.task = 'walk';
        for (const p of b.agents.values()) {
          if ((p.role === 'resident' || p.role === 'vendor') && p.id !== a.id && Math.hypot(p.x - a.x, p.z - a.z) < 10 && a.task === 'dance' && !talking.has(p.id)) {
            p.task = 'watch';
            p.speed = 0; p.yaw = Math.atan2(a.x - p.x, p.z - a.z);
          }
        }
      } else if (a.role === 'drifter') {
        // Ghost slides the arena when there's an audience or a chase nearby.
        const crowd = input.members.filter(p => Math.hypot(p.x - -45, p.z - 82) < 35).length;
        const chase = input.cops.some(c => c.pursuing && Math.hypot(c.x - a.x, c.z - a.z) < 60);
        if (crowd >= 2 || chase) {
          tx = a.homeX; tz = a.homeZ; speed = 1.4; a.task = 'watch';
          
        } else { tx = a.homeX; tz = a.homeZ; speed = 1.2; a.task = 'idle'; }
      } else if (a.role === 'elder') {
        // Garden storyteller; listeners gather and face him.
        tx = a.homeX; tz = a.homeZ;
        if (Math.hypot(a.x - tx, a.z - tz) < 1) { speed = 0; a.task = 'sit'; }
        else { speed = 1.2; a.task = 'walk'; }
        if (a.task === 'sit') {
          
          for (const p of b.agents.values()) {
            if (p.id !== a.id && Math.hypot(p.x - a.homeX, p.z - a.homeZ) < 6 && (p.role === 'resident' || p.role === 'vendor')) {
              p.task = 'listen';
            }
          }
        }
      } else {
        const cop = input.cops.find(c => c.pursuing && Math.hypot(c.x - a.x, c.z - a.z) < 12);
        if (cop) {
          const d = Math.hypot(a.x - cop.x, a.z - cop.z) || 1;
          tx = a.x + (a.x - cop.x || 1) / d * 6; tz = a.z + (a.z - cop.z) / d * 6;
          speed = 3.4; a.task = 'scatter';
        } else if (a.role === 'resident') {
          if (a.task !== 'watch' && a.task !== 'listen') {
            tx += Math.sin(now / 7000 + a.homeZ) * 3; tz += Math.cos(now / 7000 + a.homeZ) * 3; a.task = 'walk';
          } else { tx = a.x; tz = a.z; speed = 0; }
        }
        else {
          a.task = 'sell'; speed = 0;
        }
      }
      this.move(a, tx, tz, speed, dt, now, input.blocked);
    }
    this.tickRides(dt, now, input);
  }
  /** Paired, alternating dialogue reserves both actors until the scene ends. */
  private tickConversations(now: number, input: WorldInput): Set<string> {
    const agents = this.blackboard.agents;
    const unsafe = (a: Walker) => a.hidden || (a.role === 'racer' && this.rides.length > 0)
      || [...this.blackboard.incidents.values()].some(i => Math.hypot(i.x - a.x, i.z - a.z) < 15)
      || (a.role === 'medic' && this.blackboard.incidents.size > 0)
      || input.cops.some(c => c.pursuing && Math.hypot(c.x - a.x, c.z - a.z) < 20);
    this.conversations = this.conversations.filter(scene => {
      const a = agents.get(scene.a), b = agents.get(scene.b);
      if (a && b && (scene.started === -1 || now - scene.started < (scene.ready ? scene.lines.length * 3200 : 15000)) && !unsafe(a) && !unsafe(b)) return true;
      for (const p of [a, b]) if (p) { p.say = undefined; p.chatUntil = 0; p.nextChat = now + 18000; }
      return false;
    });
    const busy = new Set(this.conversations.flatMap(s => [s.a, s.b]));
    const available = (a: Walker) => !busy.has(a.id) && !unsafe(a) && now >= a.nextChat
      && !['builder', 'kid', 'jogger', 'dancer', 'guard'].includes(a.role)
      && !['respond', 'treat', 'guard'].includes(a.task);
    const hosts = [...agents.values()].sort((a, b) => Number(['vendor', 'mechanic', 'elder'].includes(b.role)) - Number(['vendor', 'mechanic', 'elder'].includes(a.role)));
    for (const a of hosts) {
      if (!this.dialogue || this.disposed || now < this.nextDialogue || this.conversations.some(s => !s.ready)) break;
      if (!available(a)) continue;
      const b = [...agents.values()].find(p => p.id !== a.id && available(p) && Math.hypot(p.x - a.x, p.z - a.z) < 6);
      if (!b) continue;
      let first = a, second = b;
      if (b.role === 'vendor' || b.role === 'mechanic' || b.role === 'elder') { first = b; second = a; }
      const scene: Conversation = { a: first.id, b: second.id, started: now, lines: [], turn: -1, ready: false };
      this.conversations.push(scene); this.nextDialogue = now + 20000;
      const key = [first.id, second.id].sort().join(':');
      const context = {
        participants: [first, second].map(p => ({ id: p.id, name: p.name, role: p.role })),
        situation: `At (${Math.round(first.x)},${Math.round(first.z)}). Activities: ${first.task}, ${second.task}. Nearby: ${[...agents.values()].filter(p => Math.hypot(p.x - first.x, p.z - first.z) < 15).map(p => `${p.name} ${p.task}`).join(', ')}. Construction: ${this.blackboard.sites.map(s => `${s.id} stage ${s.stage}`).join(', ')}. Incidents: ${this.blackboard.incidents.size}. Races: ${this.rides.map(r => `${r.name} ${r.state} lap ${r.lap}`).join(', ') || 'none'}.`,
        history: [...(this.dialogueMemory.get(key) ?? [])],
      };
      void Promise.resolve().then(() => this.dialogue!(context)).then(result => {
        if (this.disposed || !this.conversations.includes(scene) || this.dialogueNow - scene.started >= 15000) return;
        const lines = dialogueLines(result);
        if (!lines) { scene.started = -Infinity; return; }
        scene.lines = lines; scene.ready = true; scene.started = -1;
      }).catch(() => { scene.started = -Infinity; });
      busy.add(a.id); busy.add(b.id);
      this.paths.delete(a.id); this.paths.delete(b.id);
    }
    for (const scene of this.conversations) {
      const a = agents.get(scene.a)!, b = agents.get(scene.b)!;
      if (scene.started === -1) scene.started = now;
      if (!scene.ready) { a.speed = b.speed = 0; a.task = b.task = 'listen'; continue; }
      const turn = Math.floor((now - scene.started) / 3200);
      const speaker = turn % 2 ? b : a, listener = turn % 2 ? a : b;
      for (const [p, peer] of [[a, b], [b, a]]) {
        p.speed = 0; p.yaw = Math.atan2(peer.x - p.x, p.z - peer.z);
        p.task = p === speaker ? 'talk' : 'listen';
      }
      if (turn !== scene.turn) {
        listener.say = undefined; speaker.say = scene.lines[turn];
        speaker.chatUntil = scene.started + (turn + 1) * 3200; scene.turn = turn;
        const key = [a.id, b.id].sort().join(':');
        this.dialogueMemory.set(key, [...(this.dialogueMemory.get(key) ?? []), `${speaker.name}: ${speaker.say}`].slice(-8));
      }
    }
    return busy;
  }
  /** Maya vs Leo: countdown at the paddock, 2 laps of the circuit, cooldown. */
  private tickRides(dt: number, now: number, input: WorldInput): void {
    const maya = this.blackboard.agents.get('w-06');
    const leo = this.blackboard.agents.get('w-07');
    if (!maya || !leo) return;
    if (this.rides.length === 0) {
      const crowd = input.members.filter(p => Math.hypot(p.x - -45, p.z - 82) < 30).length;
      const called = this.directives.raceNow === true;
      if ((called || crowd >= 1) && now >= this.raceCooldownUntil) {
        this.directives.raceNow = false;
        this.rides.push(
          { id: 'ride-maya', name: 'Maya', kind: 'sport', ...racePathAt(0, -2.2), speed: 0, lap: 1, state: 'countdown', countdownT: 3.2, dist: 0 },
          { id: 'ride-leo', name: 'Leo', kind: 'muscle', ...racePathAt(0, 2.2), speed: 0, lap: 1, state: 'countdown', countdownT: 3.2, dist: 0 },
        );
        maya.hidden = leo.hidden = true;
        
        
      }
      return;
    }
    for (const r of this.rides) {
      if (r.state === 'countdown') {
        r.countdownT -= dt;
        const n = Math.ceil(r.countdownT);
        if (r.countdownT > 0 && n <= 3) {
          // Countdown bypasses the chat anti-spam gate so 3-2-1 all show.
          const w = this.blackboard.agents.get(r.id === 'ride-maya' ? 'w-06' : 'w-07');
          if (w) { w.say = n === 3 ? '3…' : n === 2 ? '2…' : '1… GO!'; w.chatUntil = now + 1200; }
        }
        if (r.countdownT <= 0) r.state = 'racing';
        continue;
      }
      const lane = r.id === 'ride-maya' ? -2.2 : 2.2;
      if (r.state === 'cooldown') {
        const old = r.speed; r.speed = Math.max(0, r.speed - 8 * dt);
        r.braking = r.speed > 0;
        r.dist += (old + r.speed) * 0.5 * dt;
        const p = racePathAt(r.dist, lane); r.x = p.x; r.z = p.z; r.yaw = p.yaw;
        continue;
      }
      // Corner-aware pace: slow into yaw changes, flat out on straights.
      let target = r.id === 'ride-maya' ? 27 : 26.4;
      // Brake before bends to keep lateral acceleration below 5 m/s².
      for (let look = 0; look <= 65; look += 2) {
        const curvature = Math.abs(racePathAt(r.dist + look, lane).curvature);
        const cornerSpeed = Math.sqrt(5 / Math.max(0.001, curvature));
        target = Math.min(target, Math.sqrt(cornerSpeed * cornerSpeed + 2 * 8 * look));
      }
      const old = r.speed;
      r.speed += Math.max(-8 * dt, Math.min(4 * dt, target - r.speed));
      r.braking = r.speed < old - 0.01;
      r.dist += (old + r.speed) * 0.5 * dt;
      r.lap = Math.min(2, Math.floor(r.dist / racePathLength(lane)) + 1);
      const p = racePathAt(r.dist, lane);
      r.x = p.x; r.z = p.z; r.yaw = p.yaw;
      r.steer = Math.max(-1, Math.min(1, Math.atan(2.7 * p.curvature) / 0.55));
      if (r.dist >= racePathLength(lane) * 2) {
        r.state = 'cooldown';
      }
    }
    if (this.rides.every(r => r.state === 'cooldown' && r.speed < 0.05)) {
      this.rides.length = 0;
      this.raceCooldownUntil = now + 45_000;
      maya.hidden = undefined; leo.hidden = undefined;
      maya.task = 'idle'; leo.task = 'idle';
    }
  }
  /** Rides for clients to render (stable order: Maya, Leo). */
  rideSnapshot(): RideState[] {
    return this.rides.map(r => ({ ...r }));
  }
  private move(a: Walker, x: number, z: number, speed: number, dt: number, now: number, blocked?: WorldInput['blocked']): void {
    const solid = (px: number, pz: number): boolean => Math.abs(px) > 155 || Math.abs(pz) > 155 || !!blocked?.(px, pz) || this.blackboard.sites.some(s => s.stage > 0 && Math.abs(px - s.x) < s.w / 2 + 0.4 && Math.abs(pz - s.z) < s.d / 2 + 0.4);
    let path = this.paths.get(a.id);
    if (path && Math.hypot(path.x - x, path.z - z) > 4) { this.paths.delete(a.id); path = undefined; }
    if (path) {
      while (path.points.length && Math.hypot(path.points[0].x - a.x, path.points[0].z - a.z) < 0.5) path.points.shift();
      if (!path.points.length && now >= path.retry) { this.paths.delete(a.id); path = undefined; }
    }
    if (path?.points.length) { x = path.points[0].x; z = path.points[0].z; }
    const dx = x - a.x, dz = z - a.z, d = Math.hypot(dx, dz);
    a.speed = d < 0.15 ? 0 : Math.min(speed, d / Math.max(dt, 0.001));
    if (!a.speed) return;
    const desiredYaw = Math.atan2(dx, -dz);
    const turn = Math.atan2(Math.sin(desiredYaw - a.yaw), Math.cos(desiredYaw - a.yaw));
    a.yaw += Math.max(-5 * dt, Math.min(5 * dt, turn));
    const nx = a.x + dx / d * a.speed * dt, nz = a.z + dz / d * a.speed * dt;
    if (solid(nx, nz) && (!path || now >= path.retry)) {
      const target = path ? { x: path.x, z: path.z } : { x, z };
      this.paths.set(a.id, { ...target, points: walkPath(a, target, solid), retry: now + 3000 });
    }
    const oldX = a.x, oldZ = a.z;
    if (!solid(nx, nz)) { a.x = nx; a.z = nz; }
    else if (!solid(nx, a.z)) a.x = nx;
    else if (!solid(a.x, nz)) a.z = nz;
    else a.speed = 0;
    a.speed = Math.hypot(a.x - oldX, a.z - oldZ) / Math.max(dt, 0.001);
  }
}
