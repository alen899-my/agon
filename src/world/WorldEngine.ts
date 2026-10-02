import { VEHICLE_KINDS, VEHICLES, type VehicleKind } from './Vehicles';
import * as THREE from 'three';
import { RealtimeClient, type RaceDirEntry, type RemoteDot, type RemotePos } from '../api/realtime';
import { GameLoop } from '../game/GameLoop';
import type { Theme } from '../game/State';
import { barrelSound, bbSound, countdownBeep, crashThud, crowdCheerSound, horn, ttSound, unlockAudio } from '../game/Sound';
import { AssetKit, buildMap, type Stickman, type Vehicle } from './Assets';
import { BUILDINGS, GAME_CENTER, HOOP, PLACES, RACE_ARENA, RACE_CROWD, RIM, TABLE, seeded } from './Map';
import { BarrelSim, createBarrelMesh } from './Barrels';
import { Simulation, type WorldAction, type WorldSnapshot } from './Simulation';
import { RaceSim, type RacerState } from './RaceSim';
import { gridSlots } from './Track';
import { RaceRoute } from './RaceRoute';
import { SkidMarks } from './SkidMarks';
import { VehicleAudio } from '../game/VehicleAudio';
import type { TTShot } from './TableTennis';

export type { RacerState };

export type QualityLevel = 'low' | 'balanced' | 'high' | 'ultra';
const QUALITY_PIXEL: Record<QualityLevel, number> = { low: 1, balanced: 1.5, high: 2, ultra: 2.5 };
const QUALITY_SHADOW: Record<QualityLevel, number> = { low: 512, balanced: 1024, high: 2048, ultra: 4096 };

/** Max rendered friend ghosts (nearest-first); the rest stay as map dots. */
const MAX_GHOSTS = 24;
/** Ghosts silent longer than this are removed (server prunes at ~3 s too). */
const GHOST_TIMEOUT_MS = 3500;

/** Draws a pill name tag onto a 256x72 canvas. Shared by the local + ghost tags. */
function drawNameTag(canvas: HTMLCanvasElement, texture: THREE.CanvasTexture, name: string): void {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 72);
  if (name) {
    const label = name.length > 14 ? `${name.slice(0, 13)}…` : name;
    ctx.fillStyle = 'rgba(10, 10, 12, 0.72)';
    if (typeof ctx.roundRect === 'function') { ctx.beginPath(); ctx.roundRect(28, 8, 200, 52, 14); ctx.fill(); }
    else ctx.fillRect(28, 8, 200, 52);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)'; ctx.lineWidth = 2; ctx.stroke();
    let size = 30;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    do {
      ctx.font = `600 ${size}px Arial, sans-serif`;
      size -= 2;
    } while (ctx.measureText(label).width > 178 && size > 12);
    ctx.fillStyle = '#ffffff'; ctx.fillText(label, 128, 36);
  }
  texture.needsUpdate = true;
}

interface Ghost {
  id: string;
  actor: Stickman;
  tag: THREE.Sprite;
  tagCanvas: HTMLCanvasElement;
  tagTexture: THREE.CanvasTexture;
  vehicle: Vehicle | null;
  vehicleKind: VehicleKind | null;
  x: number; y: number; z: number; yaw: number; facing: number;
  stride: number;
  blinker: number;
}

export class WorldEngine {
  readonly simulation = new Simulation();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.12, 340);
  private readonly kit: AssetKit;
  private readonly avatar: Stickman;
  private playerName = '';
  private readonly nameCanvas: HTMLCanvasElement;
  private readonly nameTexture: THREE.CanvasTexture;
  private readonly nameTag: THREE.Sprite;
  private car: Vehicle;
  private readonly fleet = new Map<VehicleKind, Vehicle>();
  private readonly parked: Vehicle[] = [];
  private parkedKinds: (string | null)[] = [];
  private readonly traffic: Vehicle[] = [];
  private trafficKinds: (string | null)[] = [];
  private readonly sun = new THREE.DirectionalLight(0xffffff, 3);
  private readonly ambient = new THREE.HemisphereLight(0xffffff, 0x555555, 2.2);
  private readonly marker: THREE.Mesh;
  private readonly ttBall: THREE.Mesh;
  private readonly ttPaddleYou = new THREE.Group();
  private readonly ttPaddleAi = new THREE.Group();
  private readonly ttTrail: THREE.Line;
  private ttTrailPos: Float32Array;
  private lastTTEvents = 0;
  private readonly bbBall: THREE.Mesh;
  private readonly bbRim: THREE.Mesh;
  private readonly bbNet: THREE.LineSegments;
  private bbNetPos: Float32Array;
  private lastBBEvents = 0;
  private readonly loop: GameLoop;
  private readonly people: { actor: Stickman }[] = [];
  /** Static paddock spectators: positioned once, cheering every frame. */
  private readonly crowd: { actor: Stickman; phase: number }[] = [];
  /** Private-server presence. Null in solo. Remotes render as ghosts (Phase 4). */
  private realtime: RealtimeClient | null = null;
  private realtimeRoom: string | null = null;
  connectionNotice = '';
  private cancelRoomJoin: (() => void) | null = null;
  private realtimeMembers = 0;
  private realtimeDots: RemoteDot[] = [];
  private readonly remotes = new Map<string, { name: string; pos: RemotePos; updatedAt: number; blinker: number }>();
  /** Host-authoritative race lobby. Works over the same presence socket. */
  readonly race = new RaceSim();
  private raceRoute: RaceRoute | null = null;
  get raceGuidanceActive(): boolean {
    const me = this.race.racers.get(this.localRaceId);
    return !!me && !me.finished && (this.race.phase === 'countdown' || this.race.phase === 'racing');
  }
  /** Arena directory: joinable races in this server (refreshed by server push + request). */
  raceDir: RaceDirEntry[] = [];
  onRace: (() => void) | null = null;
  raceNotice = '';
  private raceJoinDeadline = 0;
  private localRaceId = '';
  private lastRacePosSend = 0;
  private lastRaceStateSend = 0;
  private raceStateDirty = false;
  /** Rendered friend ghosts (nearest MAX_GHOSTS) + pooled ghost vehicles by kind. */
  private readonly ghosts = new Map<string, Ghost>();
  private readonly ghostVehiclePool = new Map<VehicleKind, Vehicle[]>();
  private ghostSeed = 0;
  private shake = 0; private lastImpactAt = -10; private prevSimTime = 0;
  private quality: QualityLevel = 'balanced'; private pixelCap = QUALITY_PIXEL.balanced;
  private lastW = 1; private lastH = 1;
  readonly barrelSim = new BarrelSim();
  private lastCountdownSec = -1;
  private prevRacePhase: 'idle' | 'lobby' | 'countdown' | 'racing' | 'finished' = 'idle';
  private readonly cameraBoxes = BUILDINGS.map(b => new THREE.Box3(new THREE.Vector3(b.x - b.w / 2 - 0.35, 0, b.z - b.d / 2 - 0.35), new THREE.Vector3(b.x + b.w / 2 + 0.35, b.h + 0.5, b.z + b.d / 2 + 0.35)));
  private target = new THREE.Vector3(); private desired = new THREE.Vector3(); private direction = new THREE.Vector3(); private hit = new THREE.Vector3(); private ray = new THREE.Ray();
  private suspended = false; private disposed = false; private hudTime = 0;
  /** Drift skid marks: twin rubber ribbons behind the rear wheels, fading over a minute. */
  private readonly skids = new SkidMarks();
  /** Continuous engine voices: player car + nearest traffic, skid screech. */
  private readonly vehicleAudio = new VehicleAudio();

  constructor(private canvas: HTMLCanvasElement, private publish: (value: WorldSnapshot) => void) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.kit = new AssetKit(); buildMap(this.scene, this.kit);
    this.scene.add(this.ambient, this.sun, this.sun.target);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -44, right: 44, top: 44, bottom: -44, near: 1, far: 150 });
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.1;
    this.avatar = this.kit.stickman(true); this.scene.add(this.avatar.group);
    // Floating name tag shown above your head while walking (GTA-style player tag).
    this.nameCanvas = document.createElement('canvas'); this.nameCanvas.width = 256; this.nameCanvas.height = 72;
    this.nameTexture = new THREE.CanvasTexture(this.nameCanvas); this.nameTexture.colorSpace = THREE.SRGBColorSpace;
    const nameMat = new THREE.SpriteMaterial({ map: this.nameTexture, transparent: true, depthTest: false, opacity: 0.95 });
    this.nameTag = new THREE.Sprite(nameMat); this.nameTag.scale.set(1.9, 0.53, 1);
    this.nameTag.renderOrder = 10; this.nameTag.visible = false; this.scene.add(this.nameTag);
    for (const kind of VEHICLE_KINDS) {
      const vehicle = this.kit.car(kind, false, 0);
      vehicle.group.visible = false; this.fleet.set(kind, vehicle); this.scene.add(vehicle.group);
    }
    this.car = this.fleet.get('car')!;
    this.scene.add(this.skids.group);
    this.parkedKinds = [];
    this.trafficKinds = [];
    const random = seeded(8008);
    for (let i = 0; i < 16; i++) {
      const actor = this.kit.stickman(false, i); actor.group.scale.setScalar(0.9 + random() * 0.15);
      this.scene.add(actor.group); this.people.push({ actor });
    }
    // Neon Paddock meet crowd: static ring around the show-car display.
    RACE_CROWD.forEach((spot, i) => {
      const actor = this.kit.stickman(false, (i * 5) % 9);
      actor.group.scale.setScalar(0.88 + random() * 0.2);
      actor.group.position.set(spot.x, 0.08, spot.z);
      actor.group.rotation.y = -spot.yaw;
      this.scene.add(actor.group);
      this.crowd.push({ actor, phase: random() * 6.28 });
    });
    this.syncWorldVehicles(true);
    this.marker = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.07, 8, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
    this.marker.rotation.x = -Math.PI / 2; this.marker.renderOrder = 5; this.scene.add(this.marker);
    // Table tennis dynamic props (world-anchored at GAME_CENTER).
    const ballMat = new THREE.MeshStandardMaterial({ color: 0xff6d1f, roughness: 0.35 });
    this.ttBall = new THREE.Mesh(new THREE.SphereGeometry(TABLE ? 0.05 : 0.05, 20, 14), ballMat);
    this.ttBall.castShadow = true; this.scene.add(this.ttBall);
    const paddleFace = new THREE.CylinderGeometry(0.11, 0.11, 0.025, 24);
    const faceMat = new THREE.MeshStandardMaterial({ color: 0xb3122e, roughness: 0.6 });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x4a2f1d, roughness: 0.8 });
    for (const [group, flip] of [[this.ttPaddleYou, 0], [this.ttPaddleAi, Math.PI]] as const) {
      const face = new THREE.Mesh(paddleFace, faceMat); face.castShadow = true;
      face.rotation.x = Math.PI / 2 + flip * 0;
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.03), handleMat);
      handle.position.y = -0.16;
      group.add(face, handle); this.scene.add(group);
    }
    this.ttTrailPos = new Float32Array(14 * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute('position', new THREE.BufferAttribute(this.ttTrailPos, 3));
    this.ttTrail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }));
    this.ttTrail.frustumCulled = false; this.scene.add(this.ttTrail);
    // Basketball dynamic props (world-anchored at HOOP).
    const bbMat = new THREE.MeshStandardMaterial({ color: 0xe0621a, roughness: 0.55 });
    this.bbBall = new THREE.Mesh(new THREE.SphereGeometry(0.12, 20, 14), bbMat);
    this.bbBall.castShadow = true;
    const seam = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.008, 8, 32), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 }));
    this.bbBall.add(seam); this.scene.add(this.bbBall);
    this.bbRim = new THREE.Mesh(new THREE.TorusGeometry(RIM.r, RIM.tube, 10, 32), new THREE.MeshStandardMaterial({ color: 0xd23c1e, roughness: 0.4, metalness: 0.5 }));
    this.bbRim.rotation.x = Math.PI / 2;
    this.bbRim.position.set(HOOP.x, RIM.h, HOOP.z); this.bbRim.castShadow = true;
    this.scene.add(this.bbRim);
    this.bbNetPos = new Float32Array(8 * 2 * 3);
    const netGeo = new THREE.BufferGeometry();
    netGeo.setAttribute('position', new THREE.BufferAttribute(this.bbNetPos, 3));
    this.bbNet = new THREE.LineSegments(netGeo, new THREE.LineBasicMaterial({ color: 0xf5f5f5, transparent: true, opacity: 0.85 }));
    this.bbNet.frustumCulled = false; this.scene.add(this.bbNet);
    this.setTheme('light');
    // Interactive dynamic barrels in the street racing arena
    for (const b of this.barrelSim.barrels) {
      const mesh = createBarrelMesh(b.color);
      mesh.position.set(b.x, b.y, b.z);
      mesh.rotation.set(b.pitch, b.yaw, b.roll);
      this.scene.add(mesh);
      b.mesh = mesh;
    }
    this.loop = new GameLoop(dt => {
      const nowMs = Date.now();
      this.race.pollCountdown(nowMs);
      if (this.race.phase === 'countdown') {
        const sec = Math.ceil(Math.max(0, this.race.countdownEndsAt - nowMs) / 1000);
        if (sec !== this.lastCountdownSec && sec >= 1) {
          this.lastCountdownSec = sec;
          countdownBeep('red');
        }
      } else if (this.prevRacePhase === 'countdown' && this.race.phase === 'racing') {
        countdownBeep('green');
        crowdCheerSound();
        this.lastCountdownSec = -1;
      }
      this.prevRacePhase = this.race.phase;

      if (this.race.phase !== 'countdown') this.simulation.update(dt);
      // Drift rubber: lay twin skid marks while sliding, fade out over a minute.
      // Engine voices: player car + nearest traffic, skid screech while sliding.
      {
        const sm = this.simulation;
        const spec = VEHICLES[sm.vehicleKind];
        const sliding = sm.driving && sm.skidding && Math.abs(sm.car.speed) > 3;
        this.skids.update({
          active: sm.phase === 'playing' && sliding,
          x: sm.car.x, z: sm.car.z, yaw: sm.car.yaw,
          slip: Math.abs(sm.lateralSpeed), time: sm.time,
          rearOff: spec.length * 0.32, trackHalf: spec.width / 2 - 0.03,
        });
        const live = sm.phase === 'playing' && !sm.paused;
        this.vehicleAudio.updatePlayer({
          kind: sm.vehicleKind, speed: sm.car.speed, topSpeed: spec.topSpeed,
          load: Math.max(0, Math.min(1, sm.acceleration / 8)),
          audible: live && sm.driving,
        });
        // Surrounding traffic stays silent — player engine only.
        this.vehicleAudio.updateTraffic([], sm.driving ? sm.car.x : sm.x, sm.driving ? sm.car.z : sm.z);
        this.vehicleAudio.setSkid(live && sliding, Math.min(1, Math.abs(sm.lateralSpeed) / 6 + 0.3));
      }
      this.hudTime += dt;
      if (this.hudTime >= 0.1) { this.hudTime = 0; this.emit(); }
    }, this.render);
    this.emit();
  }
  private emit(): void {
    const sim = this.simulation;
    const nowMs = Date.now();
    if (this.raceJoinDeadline && nowMs > this.raceJoinDeadline) {
      this.leaveRace(); this.raceNotice = 'The race host did not respond. Please try joining again.';
    }
    if (this.realtime?.connected && sim.phase === 'playing') {
      this.realtime.sendPos({
        x: sim.x, z: sim.z, y: sim.y, yaw: sim.yaw, facing: sim.facing,
        driving: sim.driving, vehicleKind: sim.vehicleKind,
        speed: sim.driving ? sim.car.speed : sim.pace,
      });
      // Race progress @10Hz (same cadence as pos). Works solo too (host relays when joined).
      if (this.race.phase !== 'idle') {
        const me = this.race.racers.get(this.localRaceId);
        if (me && !this.race.isHost && nowMs - this.lastRacePosSend > 90) {
          this.lastRacePosSend = nowMs;
          this.realtime.sendRacePos({
            hostId: this.race.hostId,
            lap: me.lap, cp: me.checkpoint, dist: me.dist,
            finished: me.finished, finishMs: me.finishMs, bestLapMs: me.bestLapMs,
            vehicleKind: me.vehicleKind, ready: me.ready, blinker: sim.blinker,
          });
        }
        // Host broadcasts authoritative snapshot on change + 2Hz heartbeat during countdown/racing.
        if (this.race.isHost && (this.raceStateDirty || nowMs - this.lastRaceStateSend > 500)) {
          this.lastRaceStateSend = nowMs;
          this.raceStateDirty = false;
          this.realtime.sendRaceState(this.race.snapshot());
        }
      }
    }
    // Local race ticking (countdown -> racing -> lap/finish) runs even solo-offline.
    if (sim.phase === 'playing' && this.race.phase !== 'idle') {
      this.race.pollCountdown(nowMs);
      if (this.race.phase === 'racing' && sim.driving) {
        const evt = this.race.tickLocal(sim.car.x, sim.car.z, nowMs);
        if (evt.finished) {
          crowdCheerSound();
          // Fast-path: a finish goes out immediately (bypasses the 90ms
          // throttle) so P1's board pops within ~200ms, not a heartbeat later.
          this.sendRacePosNow();
          if (this.race.isHost) this.raceStateDirty = true;
          this.onRace?.();
        } else if (evt.lapped) this.onRace?.();
      }
      if (this.race.isHost) {
        const done = this.race.pollFinish(nowMs);
        if (done) {
          this.raceStateDirty = true;
          this.onRace?.();
        }
      }
    }
    this.publish({
      ...sim.snapshot,
      room: this.realtimeRoom ? { code: this.realtimeRoom, members: this.realtimeMembers } : null,
      dots: this.realtimeDots,
    });
    this.onRace?.();
  }

  get raceId(): string {
    return this.localRaceId;
  }
  get raceName(): string {
    return this.playerName;
  }
  /** Race lobby API (host-authoritative, max 8, min 2 to start). */
  ensureRaceId(): string {
    if (!this.localRaceId) this.localRaceId = `r-${Math.random().toString(36).slice(2, 9)}`;
    return this.localRaceId;
  }
  createRace(laps: number, vehicleKind = this.simulation.vehicleKind): boolean {
    if (!this.realtime?.connected || this.race.phase !== 'idle' || this.simulation.mode !== 'roam') return false;
    this.raceNotice = '';
    const id = this.ensureRaceId();
    this.race.create(id, this.playerName || 'YOU', vehicleKind, laps);
    this.raceStateDirty = true;
    this.emit();
    return true;
  }
  private joinRaceLobby(hostId: string, vehicleKind: VehicleKind): void {
    this.raceNotice = '';
    this.raceJoinDeadline = Date.now() + 6000;
    const id = this.ensureRaceId();
    this.race.joinAs(id, this.playerName || 'YOU', vehicleKind, hostId);
    this.raceStateDirty = true;
    // Announce immediately so the host merges us into the lobby roster.
    this.lastRacePosSend = 0;
    this.emit();
  }
  /**
   * Join a specific advertised race: reset any stale local lobby, enter as
   * waiter (paddock, no teleport) and let the host snapshot merge us in.
   * Returns false when that race is full or already started.
   */
  joinRaceByHost(hostId: string, vehicleKind = this.simulation.vehicleKind): boolean {
    if (!this.realtime?.connected || this.race.phase !== 'idle' || this.simulation.mode !== 'roam') return false;
    const entry = this.raceDir.find((r) => r.hostId === hostId);
    if (!entry || entry.phase !== 'lobby' || entry.count >= 8) return false;
    this.joinRaceLobby(hostId, vehicleKind);
    this.realtime?.requestRaceDir();
    return true;
  }
  requestRaceDir(): void {
    this.realtime?.requestRaceDir();
  }
  /** Unthrottled progress send (finish fast-path). Hosts fold it into the snapshot instead. */
  private sendRacePosNow(): void {
    const sim = this.simulation;
    const me = this.race.racers.get(this.localRaceId);
    if (!this.realtime?.connected || !me || this.race.phase === 'idle' || this.race.isHost) return;
    this.lastRacePosSend = Date.now();
    this.realtime.sendRacePos({
      hostId: this.race.hostId,
      lap: me.lap, cp: me.checkpoint, dist: me.dist,
      finished: me.finished, finishMs: me.finishMs, bestLapMs: me.bestLapMs,
      vehicleKind: me.vehicleKind, ready: me.ready, blinker: sim.blinker,
    });
  }
  toggleRaceReady(): void {
    const me = this.race.racers.get(this.localRaceId);
    if (me && this.race.phase === 'lobby') {
      me.ready = !me.ready;
      this.raceStateDirty = true;
      this.emit();
    }
  }
  setRaceLaps(laps: number): void {
    if (this.race.isHost) {
      this.race.setLaps(laps);
      this.raceStateDirty = true;
      this.emit();
    }
  }
  startRaceCountdown(): boolean {
    const ok = this.race.startCountdown(Date.now());
    if (ok) {
      this.raceStateDirty = true;
      this.teleportToGrid();
      this.emit();
    }
    return ok;
  }
  rematchRace(): void {
    if (this.race.rematch()) { this.raceStateDirty = true; this.emit(); }
  }
  leaveRace(): void {
    this.raceJoinDeadline = 0;
    const me = this.race.racers.get(this.localRaceId);
    if (this.race.isHost) this.realtime?.sendRaceState({ ...this.race.snapshot(), phase: 'idle', racers: [] });
    else if (me) this.realtime?.sendRacePos({ hostId: this.race.hostId, leaving: true,
      lap: me.lap, cp: me.checkpoint, dist: me.dist, finished: me.finished,
      finishMs: me.finishMs, bestLapMs: me.bestLapMs, vehicleKind: me.vehicleKind, ready: false, blinker: 0 });
    this.race.reset();
    this.emit();
  }
  teleportToGrid(): void {
    const slots = gridSlots();
    const order = [...this.race.racers.keys()];
    let idx = order.indexOf(this.localRaceId);
    if (idx < 0) idx = 0;
    const slot = slots[idx % slots.length];
    const me = this.race.racers.get(this.localRaceId);
    if (!me) return;
    this.simulation.vehicleKind = me.vehicleKind as VehicleKind;
    this.simulation.driving = true;
    this.simulation.repair();
    this.simulation.placeAt(slot.x, slot.z, slot.yaw);
    this.emit();
  }
  /**
   * Joins a private server's presence channel. Resolves once the server
   * welcomes us; rejects on code/auth/socket failure so the form can explain.
   */
  joinRoomSession(token: string, code: string): Promise<void> {
    this.leaveRoomSession();
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (fn: () => void): void => {
        if (!settled) {
          settled = true;
          this.cancelRoomJoin = null;
          fn();
        }
      };
      this.cancelRoomJoin = () => done(() => reject(new Error('Server connection cancelled.')));
      const client = new RealtimeClient(token, code, {
        onWelcome: (_room, you, roster) => {
          this.connectionNotice = '';
          this.realtimeRoom = code;
          this.realtimeMembers = roster.length;
          // Stable race id per socket: server player id.
          this.localRaceId = you;
          this.realtime?.requestRaceDir();
          this.emit();
          done(resolve);
        },
        onRoster: (roster) => {
          this.realtimeMembers = roster.length;
          // Roster change may mean host left: drop stale directory rows locally too.
          const present = new Set(roster.map((r) => r.id));
          for (const id of this.race.racers.keys()) {
            if (!present.has(id)) { this.race.removeParticipant(id); this.raceStateDirty = this.race.isHost; }
          }
          const before = this.raceDir.length;
          this.raceDir = this.raceDir.filter((r) => present.has(r.hostId));
          if (before !== this.raceDir.length) this.onRace?.();
          this.emit();
        },
        onPos: (id, name, pos) => {
          const prev = this.remotes.get(id);
          this.remotes.set(id, { name, pos, updatedAt: performance.now(), blinker: prev?.blinker ?? 0 });
        },
        onRacePos: (id, name, r) => {
          if (this.race.phase === 'idle' || r.hostId !== this.race.hostId) return;
          if (r.leaving) {
            this.race.removeParticipant(id);
            this.raceStateDirty = this.race.isHost;
            this.emit(); return;
          }
          const prev = this.remotes.get(id);
          if (prev) prev.blinker = r.blinker;
          // Host tracks joiners for standings; non-host applies progress.
          const knownFinished = this.race.racers.get(id)?.finished ?? false;
          this.race.upsertRemote({
            id, name, ready: r.ready, vehicleKind: r.vehicleKind,
            lap: r.lap, checkpoint: r.cp, dist: r.dist,
            finished: r.finished, finishMs: r.finishMs, bestLapMs: r.bestLapMs, isLocal: false,
          });
          // New joiner arrived while we host the lobby: rebroadcast roster promptly.
          if (this.race.isHost && this.race.phase === 'lobby') this.raceStateDirty = true;
          // Just learned a finish: rebroadcast the snapshot now so every
          // client's live board/toast updates instead of waiting 500ms.
          if (this.race.isHost && this.race.racers.get(id)?.finished && !knownFinished) this.raceStateDirty = true;
          this.onRace?.();
        },
        onRaceState: (id, _name, s) => {
          if (this.race.phase === 'idle' || id !== this.race.hostId || this.race.isHost) return;
          if (s.phase === 'idle') { this.race.reset(); this.emit(); return; }
          if (!s.racers.some(r => r.id === this.localRaceId)) return; // host is authority, ignore echoes
          this.raceJoinDeadline = 0;
          const before = this.race.phase;
          this.race.applySnapshot(s);
          // Grid teleport ONLY on countdown entry (joiners stay in paddock until lights).
          if (before !== 'countdown' && s.phase === 'countdown') this.teleportToGrid();
          if (before !== this.race.phase) this.onRace?.();
          this.emit();
        },
        onRaceDir: (races) => {
          this.raceDir = races;
          this.onRace?.();
        },
        onDots: (players) => {
          this.realtimeDots = players;
          this.emit();
        },
        onError: (code, message) => {
          if (code === 'race_join_failed') { this.race.reset(); this.raceJoinDeadline = 0; this.raceNotice = message; this.emit(); return; }
          this.connectionNotice = message;
          this.emit();
          done(() => reject(new Error(message)));
        },
        onReconnecting: () => {
          this.connectionNotice = 'Connection interrupted. Reconnecting to your server...';
          this.realtimeRoom = null; this.realtimeMembers = 0; this.realtimeDots = [];
          this.remotes.clear(); this.race.reset(); this.raceDir = []; this.raceJoinDeadline = 0;
          this.emit();
        },
        onClose: () => {
          this.realtimeRoom = null;
          this.realtimeMembers = 0;
          this.realtimeDots = [];
          this.remotes.clear();
          this.race.reset();
          this.raceJoinDeadline = 0;
          this.raceDir = [];
          this.emit();
          done(() => reject(new Error('Lost connection to the server.')));
        },
      });
      this.realtime = client;
      client.connect();
    });
  }
  /** Leaves presence (stays in the world solo). Membership rows are left for REST /leave. */
  leaveRoomSession(): void {
    this.cancelRoomJoin?.();
    this.connectionNotice = '';
    this.raceJoinDeadline = 0;
    this.realtime?.dispose();
    this.realtime = null;
    this.realtimeRoom = null;
    this.realtimeMembers = 0;
    this.realtimeDots = [];
    this.raceDir = [];
    this.remotes.clear();
    for (const id of [...this.ghosts.keys()]) this.removeGhost(id);
    // Leaving the server drops any race (host authority lives in the room).
    if (this.race.phase !== 'idle') this.race.reset();
    this.emit();
  }
  private acquireGhostVehicle(kind: VehicleKind): Vehicle {
    const vehicle = this.ghostVehiclePool.get(kind)?.pop();
    if (vehicle) {
      if (!vehicle.group.parent) this.scene.add(vehicle.group);
      vehicle.group.visible = true;
      return vehicle;
    }
    const fresh = this.kit.car(kind, false, this.ghostSeed % 8);
    this.scene.add(fresh.group);
    return fresh;
  }
  private releaseGhostVehicle(ghost: Ghost): void {
    if (!ghost.vehicle || !ghost.vehicleKind) return;
    ghost.vehicle.group.visible = false;
    const pooled = this.ghostVehiclePool.get(ghost.vehicleKind) ?? [];
    if (pooled.length < 4) {
      pooled.push(ghost.vehicle);
      this.ghostVehiclePool.set(ghost.vehicleKind, pooled);
    } else this.scene.remove(ghost.vehicle.group);
    ghost.vehicle = null;
    ghost.vehicleKind = null;
  }
  private removeGhost(id: string): void {
    const ghost = this.ghosts.get(id);
    if (!ghost) return;
    this.scene.remove(ghost.actor.group);
    this.scene.remove(ghost.tag);
    ghost.tagTexture.dispose();
    (ghost.tag.material as THREE.Material).dispose();
    this.releaseGhostVehicle(ghost);
    this.ghosts.delete(id);
  }
  /** Reconciles friend ghosts: stale out, nearest MAX_GHOSTS interpolated in. */
  private syncGhosts(dt: number): void {
    const sim = this.simulation;
    const now = performance.now();
    for (const [id, remote] of this.remotes) {
      if (now - remote.updatedAt > GHOST_TIMEOUT_MS) {
        this.remotes.delete(id);
        this.removeGhost(id);
      }
    }
    if (!sim.active) {
      for (const id of [...this.ghosts.keys()]) this.removeGhost(id);
      return;
    }
    const ordered = [...this.remotes.entries()]
      .map(([id, r]) => ({ id, r, d: Math.hypot(r.pos.x - sim.x, r.pos.z - sim.z) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_GHOSTS);
    const wanted = new Set(ordered.map((o) => o.id));
    for (const id of [...this.ghosts.keys()]) if (!wanted.has(id)) this.removeGhost(id);
    const blend = 1 - Math.exp(-10 * Math.max(0, dt));
    for (const { id, r } of ordered) {
      let ghost = this.ghosts.get(id);
      if (!ghost) {
        const actor = this.kit.stickman(false, this.ghostSeed++);
        const tagCanvas = document.createElement('canvas');
        tagCanvas.width = 256; tagCanvas.height = 72;
        const tagTexture = new THREE.CanvasTexture(tagCanvas);
        tagTexture.colorSpace = THREE.SRGBColorSpace;
        const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTexture, transparent: true, depthTest: false, opacity: 0.95 }));
        tag.scale.set(1.9, 0.53, 1);
        tag.renderOrder = 9;
        drawNameTag(tagCanvas, tagTexture, r.name);
        this.scene.add(actor.group);
        this.scene.add(tag);
        ghost = {
          id, actor, tag, tagCanvas, tagTexture, vehicle: null, vehicleKind: null,
          x: r.pos.x, y: r.pos.y, z: r.pos.z, yaw: r.pos.yaw, facing: r.pos.facing, stride: 0, blinker: 0,
        };
        this.ghosts.set(id, ghost);
      }
      // Snap on teleports, otherwise ease toward the latest fix.
      if (Math.hypot(r.pos.x - ghost.x, r.pos.z - ghost.z) > 15) {
        ghost.x = r.pos.x; ghost.z = r.pos.z; ghost.y = r.pos.y;
        ghost.yaw = r.pos.yaw; ghost.facing = r.pos.facing;
      } else {
        ghost.x += (r.pos.x - ghost.x) * blend;
        ghost.z += (r.pos.z - ghost.z) * blend;
        ghost.y += (r.pos.y - ghost.y) * blend;
        let dyaw = r.pos.yaw - ghost.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        ghost.yaw += dyaw * blend;
        let dface = r.pos.facing - ghost.facing;
        while (dface > Math.PI) dface -= Math.PI * 2;
        while (dface < -Math.PI) dface += Math.PI * 2;
        ghost.facing += dface * blend;
      }
      const kind = (VEHICLE_KINDS as readonly string[]).includes(r.pos.vehicleKind)
        ? (r.pos.vehicleKind as VehicleKind)
        : 'car';
      if (r.pos.driving) {
        ghost.actor.group.visible = false;
        if (!ghost.vehicle || ghost.vehicleKind !== kind) {
          this.releaseGhostVehicle(ghost);
          ghost.vehicle = this.acquireGhostVehicle(kind);
          ghost.vehicleKind = kind;
        }
        ghost.vehicle.group.visible = true;
        ghost.vehicle.group.position.set(ghost.x, 0.08, ghost.z);
        ghost.vehicle.group.rotation.y = -ghost.yaw;
        ghost.blinker = r.blinker;
        ghost.vehicle.update(r.pos.speed, 0, dt, false, undefined, ghost.blinker, sim.time);
        ghost.tag.visible = sim.view === 'third';
        ghost.tag.position.set(ghost.x, ghost.y + 2.6, ghost.z);
      } else {
        if (ghost.vehicle) this.releaseGhostVehicle(ghost);
        ghost.actor.group.visible = sim.view === 'third';
        ghost.actor.group.position.set(ghost.x, ghost.y + 0.08, ghost.z);
        ghost.actor.group.rotation.y = -ghost.facing;
        const intensity = Math.min(1.2, Math.abs(r.pos.speed) / 4.6);
        ghost.stride += Math.abs(r.pos.speed) * dt * 2.1;
        ghost.actor.animate({ phase: ghost.stride, intensity, airborne: ghost.y > 0.02, dip: 0, idle: sim.time });
        ghost.tag.visible = sim.view === 'third';
        ghost.tag.position.set(ghost.x, ghost.y + 2.35, ghost.z);
      }
    }
  }
  /** Sets the walker's display name (from name-only login) and redraws the head tag. */
  setPlayerName(name: string): void {
    this.playerName = name.trim().slice(0, 24);
    drawNameTag(this.nameCanvas, this.nameTexture, this.playerName);
    const me = this.race.racers.get(this.localRaceId);
    if (me) { me.name = this.playerName; this.raceStateDirty = true; }
    this.emit();
  }
  /** Keep render meshes in sync with the stealable world: rebuild on kind change, grow/shrink freely. */
  private syncWorldVehicles(initial = false): void {
    const sim = this.simulation;
    const trafficVariant = (kind: string, i: number): number => (i * 3 + kind.length + kind.charCodeAt(0)) % 8;
    const parkedVariant = (kind: string, i: number): number => (i * 5 + 2 + kind.charCodeAt(0)) % 8;
    while (this.traffic.length < sim.traffic.length) {
      const kind = sim.traffic[this.traffic.length]?.kind ?? 'car';
      const v = this.kit.car(kind, false, trafficVariant(kind, this.traffic.length));
      this.scene.add(v.group); this.traffic.push(v); this.trafficKinds.push(null);
    }
    while (this.traffic.length > sim.traffic.length) {
      const v = this.traffic.pop()!; this.scene.remove(v.group); this.trafficKinds.pop();
    }
    sim.traffic.forEach((t, i) => {
      const key = `${t.kind}:${trafficVariant(t.kind, i)}`;
      if (!initial && this.trafficKinds[i] === key) return;
      this.scene.remove(this.traffic[i].group);
      const v = this.kit.car(t.kind, false, trafficVariant(t.kind, i));
      this.scene.add(v.group); this.traffic[i] = v; this.trafficKinds[i] = key;
    });
    while (this.parked.length < sim.parked.length) {
      const kind = sim.parked[this.parked.length]?.kind ?? 'car';
      const v = this.kit.car(kind, false, parkedVariant(kind, this.parked.length));
      this.scene.add(v.group); this.parked.push(v); this.parkedKinds.push(null);
    }
    while (this.parked.length > sim.parked.length) {
      const v = this.parked.pop()!; this.scene.remove(v.group); this.parkedKinds.pop();
    }
    sim.parked.forEach((p, i) => {
      const key = `${p.kind}:${parkedVariant(p.kind, i)}`;
      if (!initial && this.parkedKinds[i] === key) return;
      this.scene.remove(this.parked[i].group);
      const v = this.kit.car(p.kind, false, parkedVariant(p.kind, i));
      this.scene.add(v.group); this.parked[i] = v; this.parkedKinds[i] = key;
    });
  }
  begin(): void { unlockAudio(); this.simulation.begin(); this.emit(); }
  /** Leave the optional race before returning to the entry screen. */
  exitToIntro(): void {
    this.leaveRace(); this.clearInput(); this.simulation.exitToIntro(); this.emit();
  }
  enterTable(): void { if (this.race.phase !== 'idle') return; unlockAudio(); this.simulation.enterTable(); this.lastTTEvents = this.simulation.table.events.length; this.emit(); }
  rematch(): void { unlockAudio(); this.simulation.table.reset(); this.lastTTEvents = this.simulation.table.events.length; this.emit(); }
  enterBasket(): void { if (this.race.phase !== 'idle') return; unlockAudio(); this.simulation.enterBasket(); this.lastBBEvents = this.simulation.basket.events.length; this.emit(); }
  exitBasket(): void { this.simulation.exitBasket(); this.emit(); }
  resetBasket(): void { unlockAudio(); this.simulation.basket.resetStats(); this.lastBBEvents = this.simulation.basket.events.length; this.emit(); }
  basketTap(): void { unlockAudio(); if (this.simulation.mode === 'basket') this.simulation.basket.pressMeter(); }
  exitTable(): void { this.simulation.exitTable(); this.emit(); }
  tableSwing(kind?: TTShot): void { this.simulation.tableSwing(kind); }
  setTableX(x: number): void { if (this.simulation.mode === 'table') this.simulation.table.setPlayerX(x); }
  swipeShot(dx: number, dy: number): void {
    if (this.simulation.mode !== 'table') return;
    // Swipe up fast = topspin/smash, down = chop, else drive. Horizontal aims via paddle offset.
    this.simulation.table.movePlayer(dx * 0.6);
    if (dy < -40) this.simulation.tableSwing(this.simulation.table.ball.y > 1.25 ? 'smash' : 'topspin');
    else if (dy > 40) this.simulation.tableSwing('chop');
    else if (Math.abs(dx) + Math.abs(dy) > 24) this.simulation.tableSwing('drive');
  }
  start(): void { if (!this.suspended) this.loop.start(); }
  togglePause(): void { this.simulation.togglePause(); this.emit(); }
  toggleView(): void { this.simulation.toggleView(); this.emit(); }
  cycleVehicle(): void { if (this.race.phase !== 'idle') return; this.simulation.cycleVehicle(); this.emit(); }
  interact(): void { if (this.race.phase === 'countdown' || this.race.phase === 'racing') return; this.simulation.interact(); this.emit(); }
  waypoint(id: string): void { if (PLACES.some(p => p.id === id)) { this.simulation.waypoint = id; this.emit(); } }
  input(action: WorldAction, down: boolean, source: string): void {
    if (action === 'horn') { if (down) this.honk(); return; }
    if (!this.suspended || !down) this.simulation.setInput(action, down, source);
  }
  /** Horn for the driven car: polite meep, air horn for rigs. */
  honk(): void {
    const sm = this.simulation;
    if (!sm.driving || sm.phase !== 'playing') return;
    const category = VEHICLES[sm.vehicleKind].category;
    horn(category === 'truck' || category === 'bus' || category === 'van' || category === 'service');
  }
  joystick(x: number, y: number): void { if (!this.suspended) this.simulation.setStick(x, y); }
  look(dx: number, dy: number): void { if (!this.suspended) this.simulation.look(dx, dy); }
  clearInput(): void { this.simulation.clearInput(); }
  setSuspended(value: boolean): void { this.suspended = value; this.clearInput(); this.vehicleAudio.setSuspended(value); if (value) this.loop.stop(); else this.loop.start(); }
  setTheme(theme: Theme): void {
    const mats = this.kit.materials;
    if (theme === 'color') {
      // Real-life palette: asphalt, concrete, brick, glass blue, green trees.
      mats.road.color.setHex(0x3c4046);
      mats.pavement.color.setHex(0xb8b2a4);
      mats.white.color.setHex(0xf7f4ec);
      mats.ink.color.setHex(0x22252a);
      mats.glass.color.setHex(0x5ea9dd);
      mats.glass.roughness = 0.12; mats.glass.metalness = 0.45;
      mats.metal.color.setHex(0x9aa1a9);
      mats.wall0.color.setHex(0xe4c188);
      mats.wall1.color.setHex(0xb65a41);
      mats.wall2.color.setHex(0x6f87a3);
      mats.leaf.color.setHex(0x43a047);
      const sky = 0x87bfe8;
      this.scene.background = new THREE.Color(sky); this.scene.fog = new THREE.Fog(sky, 100, 280);
      this.sun.color.setHex(0xfff0d6); this.sun.intensity = 3;
      this.ambient.color.setHex(0xcfe5ff); this.ambient.groundColor.setHex(0x8a9a7b); this.ambient.intensity = 1.6;
      this.renderer.toneMappingExposure = 1.1;
      if (this.marker) (this.marker.material as THREE.MeshBasicMaterial).color.setHex(0xe11d48);
      return;
    }
    // Monochrome palettes (light / dark).
    mats.road.color.setHex(0x373737);
    mats.pavement.color.setHex(0x9b9b9b);
    mats.white.color.setHex(0xf1f1f1);
    mats.ink.color.setHex(0x181818);
    mats.glass.color.setHex(0x414141);
    mats.glass.roughness = 0.25; mats.glass.metalness = 0.35;
    mats.metal.color.setHex(0x666666);
    mats.wall0.color.setHex(0xd9d9d9);
    mats.wall1.color.setHex(0xababab);
    mats.wall2.color.setHex(0x737373);
    mats.leaf.color.setHex(0x626262);
    const dark = theme === 'dark'; const color = dark ? 0x242424 : 0xdadada;
    this.scene.background = new THREE.Color(color); this.scene.fog = new THREE.Fog(color, 90, 255);
    this.sun.color.setHex(0xffffff);
    this.ambient.color.setHex(0xffffff); this.ambient.groundColor.setHex(0x555555);
    this.ambient.intensity = dark ? 1.1 : 2.2; this.sun.intensity = dark ? 1.5 : 3;
    this.renderer.toneMappingExposure = 1.05;
    if (this.marker) (this.marker.material as THREE.MeshBasicMaterial).color.setHex(dark ? 0xffffff : 0x111111);
  }
  resize(width: number, height: number): void {
    this.lastW = Math.max(1, width); this.lastH = Math.max(1, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.pixelCap));
    this.renderer.setSize(this.lastW, this.lastH, false);
    this.camera.aspect = this.lastW / this.lastH; this.camera.updateProjectionMatrix();
  }
  /** Graphics quality for high-spec devices. Live-applied: pixel ratio, shadow resolution, shadows on/off. */
  applyQuality(q: QualityLevel): void {
    this.quality = q; this.pixelCap = QUALITY_PIXEL[q];
    this.sun.shadow.mapSize.set(QUALITY_SHADOW[q], QUALITY_SHADOW[q]);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    const enable = q !== 'low';
    if (this.renderer.shadowMap.enabled !== enable) {
      this.renderer.shadowMap.enabled = enable;
      const seen = new Set<THREE.Material>();
      this.scene.traverse(o => {
        const mesh = o as THREE.Mesh;
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const m of mats as THREE.Material[]) if (m && !seen.has(m)) { seen.add(m); m.needsUpdate = true; }
      });
    }
    this.resize(this.lastW, this.lastH);
  }
  private render = (alpha: number): void => {
    if (this.disposed) return;
    const sim = this.simulation; if (!sim.active) alpha = 1;
    const raceGuidance = this.raceGuidanceActive;
    if (raceGuidance && !this.raceRoute) {
      this.raceRoute = new RaceRoute();
      this.scene.add(this.raceRoute.group);
    }
    if (this.raceRoute) this.raceRoute.group.visible = raceGuidance && sim.phase === 'playing' && sim.mode === 'roam';
    const x = THREE.MathUtils.lerp(sim.previous.x, sim.x, alpha), z = THREE.MathUtils.lerp(sim.previous.z, sim.z, alpha), y = THREE.MathUtils.lerp(sim.previous.y, sim.y, alpha);
    this.avatar.group.position.set(x, y + 0.08, z); this.avatar.group.rotation.y = -sim.facing;
    // Model forward is -Z; a positive world yaw turns it toward +X.
    const gaitI = sim.driving ? 0 : sim.moveBlend * THREE.MathUtils.clamp(sim.pace / 4.6, 0, 1.2);
    const bob = gaitI > 0.02 ? Math.abs(Math.sin(sim.stride)) * 0.045 * Math.min(1, gaitI) : Math.sin(sim.time * 2.2) * 0.006;
    this.avatar.group.position.y += bob;
    this.avatar.animate({ phase: sim.stride, intensity: gaitI, airborne: sim.y > 0.02 && !sim.driving, dip: sim.landDip, idle: sim.time });
    this.avatar.group.visible = !sim.driving && sim.view === 'third';
    // Name tag floats above your head while walking; hidden in cars, cockpit and minigames.
    const showTag = this.playerName !== '' && !sim.driving && sim.view === 'third' && sim.active && sim.mode === 'roam';
    this.nameTag.visible = showTag;
    if (showTag) this.nameTag.position.set(x, y + 2.35 + bob, z);
    // Car body feel: pitch under accel/brake, roll in corners, bounce on crash.
    const dt = Math.max(0, Math.min(0.05, sim.time - this.prevSimTime));
    this.prevSimTime = sim.time;
    const accel = sim.driving ? sim.acceleration : 0;
    for (const [kind, vehicle] of this.fleet) vehicle.group.visible = kind === sim.vehicleKind;
    this.car = this.fleet.get(sim.vehicleKind)!;
    this.car.group.position.set(sim.car.x, 0.08, sim.car.z); this.car.group.rotation.y = -sim.car.yaw;
    this.car.update(sim.car.speed, sim.car.steer, dt, sim.car.braking, {
      pitch: THREE.MathUtils.clamp(-accel * 0.012, -0.06, 0.08),
      roll: sim.skidding ? Math.sin(sim.time * 20) * 0.02 : -sim.car.steer * Math.min(0.05, Math.abs(sim.car.speed) * 0.003),
    }, sim.blinker, sim.time);
    this.car.glazing.visible = !(sim.driving && sim.view === 'first');
    // Smooth GTA doors: swing the driver door while slipping in/out, ease shut after.
    const doorOpen = sim.transition > 0 ? Math.min(1, sim.transition / 0.3) * 1.15 : 0;
    for (const [i, door] of this.car.doors.entries()) door.rotation.y = (i === 0 ? 1 : -1) * doorOpen;
    // Ped + traffic + parked positions are owned by the simulation (braking / collisions).
    this.people.forEach((person, i) => {
      const point = sim.peds[i]; if (!point) return;
      if (point.ragdoll) {
        // Ragdoll: elevate to ry height, pitch forward (tumble), use rollYaw from moment of impact.
        person.actor.group.position.set(point.x, 0.08 + point.ry, point.z);
        person.actor.group.rotation.set(point.rpitch, -point.rollYaw, 0, 'YXZ');
        person.actor.animate({ phase: point.phase, intensity: 0, airborne: point.ry > 0.05, dip: 0, idle: sim.time + i * 1.7 });
      } else {
        person.actor.group.position.set(point.x, 0.08, point.z);
        person.actor.group.rotation.set(0, -point.yaw, 0);
        person.actor.animate({ phase: point.phase, intensity: point.move, airborne: false, dip: 0, idle: sim.time + i * 1.7 });
      }
    });
    // Dynamic interactive barrels: vehicle & player collision, physics, and mesh sync
    if (sim.driving) {
      this.barrelSim.checkVehicleHit(sim.car.x, sim.car.z, sim.car.yaw, sim.car.speed, sim.vehicleKind, sim.lateralSpeed);
    } else {
      this.barrelSim.checkPlayerHit(sim.x, sim.z, sim.pvx, sim.pvz);
    }
    for (let i = 0; i < sim.traffic.length; i++) {
      const t = sim.traffic[i];
      if (t) this.barrelSim.checkVehicleHit(t.x, t.z, t.yaw, t.speed, t.kind);
    }
    this.barrelSim.update(dt, BUILDINGS);
    for (let i = 0; i < this.barrelSim.barrels.length; i++) {
      const b = this.barrelSim.barrels[i];
      if (b.mesh) {
        b.mesh.position.set(b.x, b.y, b.z);
        b.mesh.rotation.set(b.pitch, b.yaw, b.roll);
      }
    }

    // Paddock crowd: movie street-racing crowd cheering (excited jumping, waving arms overhead)
    const arenaDist = Math.hypot(sim.x - RACE_ARENA.x, sim.z - RACE_ARENA.z);
    const nearArena = arenaDist < 36;
    const isRacing = this.race.phase === 'countdown' || this.race.phase === 'racing';
    const cheerLevel = isRacing ? 1.0 : nearArena ? 0.85 : 0.45;
    for (let i = 0; i < this.crowd.length; i++) {
      const fan = this.crowd[i];
      fan.actor.animate({
        phase: fan.phase + sim.time * (4.8 + (i % 3) * 0.7),
        intensity: 0,
        airborne: false,
        dip: 0,
        idle: sim.time + i * 0.9,
        cheer: cheerLevel,
      });
    }
    this.syncWorldVehicles();
    this.traffic.forEach((vehicle, i) => {
      const p = sim.traffic[i]; if (!p) { vehicle.group.visible = false; return; }
      vehicle.group.visible = true;
      vehicle.group.position.set(p.x, 0.08, p.z); vehicle.group.rotation.y = -p.yaw;
      vehicle.update(p.speed, p.steer, dt, p.braking);
    });
    this.parked.forEach((vehicle, i) => {
      const p = sim.parked[i]; if (!p) { vehicle.group.visible = false; return; }
      vehicle.group.visible = true;
      vehicle.group.position.set(p.x, 0.08, p.z); vehicle.group.rotation.y = -p.yaw;
      vehicle.update(0, 0, 0, false);
    });
    // Friend ghosts from the private server (nearest MAX_GHOSTS, interpolated).
    this.syncGhosts(dt);
    // Table tennis sounds: play only fresh sim events.
    const evts = sim.table.events;
    if (evts.length !== this.lastTTEvents) {
      for (let i = this.lastTTEvents; i < evts.length; i++) {
        const e = evts[i];
        if (e.kind === 'paddle' || e.kind === 'serve' || e.kind === 'table' || e.kind === 'net' || e.kind === 'edge' || e.kind === 'smash' || e.kind === 'topspin' || e.kind === 'point') ttSound(e.kind, e.speedKmh);
      }
      this.lastTTEvents = evts.length;
    }
    // Table tennis actors: ball, paddles, trail, player + AI placement.
    const inTable = sim.mode === 'table';
    this.ttBall.visible = inTable; this.ttPaddleYou.visible = inTable; this.ttPaddleAi.visible = inTable; this.ttTrail.visible = inTable;
    if (inTable) {
      const gx = GAME_CENTER.x, gz = GAME_CENTER.z;
      const t = sim.table;
      this.ttBall.position.set(gx + t.ball.x, t.ball.y, gz + t.ball.z);
      const ballScale = 1 + Math.min(0.6, Math.hypot(t.vel.x, t.vel.y, t.vel.z) * 0.03);
      this.ttBall.scale.setScalar(ballScale);
      this.ttPaddleAi.position.set(gx + t.ai.x, t.ai.y, gz + t.ai.z);
      this.ttPaddleAi.rotation.set(0.5 + t.swingAi * 1.1, Math.PI, t.ai.x * 0.3);
      const trail = t.trail;
      for (let i = 0; i < 14; i++) {
        const p = trail[Math.max(0, trail.length - 14 + i)] ?? t.ball;
        this.ttTrailPos[i * 3] = gx + p.x; this.ttTrailPos[i * 3 + 1] = p.y; this.ttTrailPos[i * 3 + 2] = gz + p.z;
      }
      this.ttTrail.geometry.attributes.position.needsUpdate = true;
      // First-person: hide your own avatar (head would block the camera).
      this.avatar.group.visible = false;
      const opp = this.people[0];
      if (opp) {
        opp.actor.group.position.set(gx + t.ai.x * 0.9, 0.08, gz + t.ai.z - 0.55);
        opp.actor.group.rotation.y = Math.PI;
        opp.actor.animate({ phase: sim.time * 3, intensity: 0.25, airborne: false, dip: 0, idle: sim.time });
      }
    }
    // Basketball sounds + actors.
    const inBasket = sim.mode === 'basket';
    const bbEvts = sim.basket.events;
    if (bbEvts.length !== this.lastBBEvents) {
      for (let i = this.lastBBEvents; i < bbEvts.length; i++) {
        const e = bbEvts[i];
        bbSound(e.kind, e.speedKmh);
      }
      this.lastBBEvents = bbEvts.length;
    }
    this.bbBall.visible = inBasket; this.bbRim.visible = inBasket; this.bbNet.visible = inBasket;
    if (inBasket) {
      const b = sim.basket;
      this.bbBall.position.set(HOOP.x + b.ball.x, b.ball.y, HOOP.z + b.ball.z);
      this.bbBall.rotation.x += Math.max(0.02, b.snapshot.speedKmh * 0.002);
      this.bbBall.rotation.z -= Math.max(0.01, b.snapshot.speedKmh * 0.001);
      // Rim shake on contact, net sway on swish.
      this.bbRim.position.set(
        HOOP.x + Math.sin(sim.time * 55) * 0.03 * b.rimShake,
        RIM.h + Math.abs(Math.cos(sim.time * 47)) * 0.02 * b.rimShake,
        HOOP.z + Math.cos(sim.time * 52) * 0.03 * b.rimShake);
      const sway = b.swish * Math.sin(sim.time * 28) * 0.06;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        this.bbNetPos[i * 6] = HOOP.x + Math.cos(a) * RIM.r;
        this.bbNetPos[i * 6 + 1] = RIM.h;
        this.bbNetPos[i * 6 + 2] = HOOP.z + Math.sin(a) * RIM.r;
        this.bbNetPos[i * 6 + 3] = HOOP.x + Math.cos(a) * 0.12 + sway;
        this.bbNetPos[i * 6 + 4] = RIM.h - 0.42;
        this.bbNetPos[i * 6 + 5] = HOOP.z + Math.sin(a) * 0.12;
      }
      this.bbNet.geometry.attributes.position.needsUpdate = true;
      this.avatar.group.visible = false;
    }
    // Camera kick on fresh impacts.
    if (sim.impact && sim.impact.at !== this.lastImpactAt) { this.lastImpactAt = sim.impact.at; this.shake = Math.min(1, sim.impact.speed / 40 + 0.35); crashThud(sim.impact.speed); }
    this.shake *= 0.9;
    const shakeX = this.shake * Math.sin(sim.time * 70) * 0.35, shakeY = this.shake * Math.cos(sim.time * 55) * 0.25;
    const waypoint = PLACES.find(p => p.id === sim.waypoint);
    // Hide the waypoint ring during a match — it sits on the court otherwise.
    this.marker.visible = Boolean(waypoint) && !inTable && !inBasket && this.race.phase === 'idle';
    if (waypoint && !inTable && !inBasket) this.marker.position.set(waypoint.x, 0.25, waypoint.z);
    if (inBasket) {
      // Shooter POV from the current random spot: stand behind the release point, eyes on the rim.
      const s = sim.basket.spot;
      const sd = Math.max(0.5, Math.hypot(s.x, s.z));
      const cd = sd + 2.2;
      this.camera.position.set(HOOP.x + (s.x / sd) * cd, 2.0, HOOP.z + (s.z / sd) * cd);
      this.target.set(HOOP.x, 2.5, HOOP.z);
      this.camera.lookAt(this.target);
      this.sun.position.set(HOOP.x + 20, 65, HOOP.z + 15); this.sun.target.position.set(HOOP.x, 0, HOOP.z); this.sun.target.updateMatrixWorld();
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (inTable) {
      const gx = GAME_CENTER.x, gz = GAME_CENTER.z;
      const t = sim.table;
      // First-person: eyes just behind your end, gaze tracks the ball.
      this.camera.position.set(gx + t.player.x * 0.85 + shakeX, 1.72 + shakeY, gz + t.player.z + 0.45);
      this.target.set(gx + t.ball.x * 0.55, Math.max(0.6, t.ball.y * 0.85), gz - 1.2);
      this.camera.lookAt(this.target);
      // Bat pinned into view: bottom-center, follows your lateral position,
      // punches forward on every swing so hits feel connected.
      this.direction.subVectors(this.target, this.camera.position).normalize();
      this.desired.copy(this.camera.position)
        .addScaledVector(this.direction, 0.62 - t.swingYou * 0.12)
        .add(this.hit.set(t.player.x * 0.12, -0.3 + t.swingYou * 0.08, 0));
      this.ttPaddleYou.position.copy(this.desired);
      this.ttPaddleYou.lookAt(this.camera.position);
      this.ttPaddleYou.rotateX(-0.35 - t.swingYou * 0.9);
      this.sun.position.set(gx + 20, 65, gz + 15); this.sun.target.position.set(gx, 0, gz); this.sun.target.updateMatrixWorld();
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (sim.phase === 'ready') {
      this.camera.position.set(69, 52, 78); this.camera.lookAt(-7, 0, -8);
    } else if (sim.view === 'first') {
      if (sim.driving) {
        this.car.group.updateMatrixWorld(true);
        this.camera.position.copy(this.car.eye); this.car.body.localToWorld(this.camera.position);
        this.camera.position.x += x - sim.car.x + shakeX * 0.15;
        this.camera.position.z += z - sim.car.z;
        this.camera.position.y += shakeY * 0.15;
      } else this.camera.position.set(x + shakeX, y + 1.84 + shakeY, z);
      this.target.copy(this.camera.position).add(this.direction.set(Math.sin(sim.yaw) * 10, -Math.sin(sim.pitch) * 10, -Math.cos(sim.yaw) * 10));
      this.camera.lookAt(this.target);
    } else {
      this.target.set(x, y + 1.35, z);
      const distance = sim.driving ? VEHICLES[sim.vehicleKind].length + 6 : 6.5;
      this.desired.set(x - Math.sin(sim.yaw) * distance, y + 3.4 + sim.pitch * 5, z + Math.cos(sim.yaw) * distance);
      this.direction.subVectors(this.desired, this.target); let cameraDistance = this.direction.length(); this.direction.normalize();
      this.ray.set(this.target, this.direction);
      for (const box of this.cameraBoxes) if (this.ray.intersectBox(box, this.hit)) cameraDistance = Math.min(cameraDistance, Math.max(0.45, this.hit.distanceTo(this.target) - 0.3));
      this.camera.position.copy(this.target).addScaledVector(this.direction, cameraDistance);
      this.camera.position.x += shakeX; this.camera.position.y += shakeY;
      this.camera.lookAt(this.target);
    }
    this.sun.position.set(x + 35, 65, z + 25); this.sun.target.position.set(x, 0, z); this.sun.target.updateMatrixWorld();
    this.renderer.render(this.scene, this.camera);
  };
  destroy(): void {
    this.disposed = true; this.loop.stop(); this.clearInput();
    this.cancelRoomJoin?.();
    this.realtime?.dispose(); this.realtime = null;
    for (const id of [...this.ghosts.keys()]) this.removeGhost(id);
    for (const pooled of this.ghostVehiclePool.values()) for (const v of pooled) this.scene.remove(v.group);
    this.ghostVehiclePool.clear();
    this.raceRoute?.dispose();
    this.scene.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
    this.marker.geometry.dispose(); (this.marker.material as THREE.Material).dispose();
    this.nameTexture.dispose(); (this.nameTag.material as THREE.Material).dispose();
    this.skids.dispose(); this.vehicleAudio.dispose();
    this.sun.shadow.dispose(); this.kit.dispose(); this.renderer.dispose();
    this.scene.clear();
  }
}
