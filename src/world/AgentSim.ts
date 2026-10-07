import { AgentDirector } from '../../server/src/agents/director';
import { ScriptedDispatcher } from '../../server/src/agents/scripted';
import type { AgentGoal, Brain, DirectorContext } from '../../server/src/agents/types';
import type { DialogueContext } from '../../server/src/agents/dialogueTypes';
import { fetchDialogue, fetchDispatch } from '../api/client';
import { BUILD_LOTS, siteBox, type BuildDelta, type BuildSite, type PedAgent } from '../../server/src/agents/livingWorld';
import type { AgentEventMsg, AgentStateMsg, CrimeReport, RideMsg } from '../api/realtime';
import type { Simulation } from './Simulation';

/** Solo dispatch brain: asks the server Gemini chain, falls back to scripted on null. */
class ServerDispatchBrain implements Brain {
  readonly name = 'server-gemini';
  constructor(private readonly token: () => string | null) {}
  async decide(ctx: DirectorContext): Promise<AgentGoal | null> {
    const token = this.token();
    if (!token) return null;
    const goal = await fetchDispatch(token, {
      now: ctx.now,
      cops: ctx.cops.slice(0, 2).map(c => ({
        id: c.id, x: c.x, z: c.z, yaw: c.yaw, speed: c.speed,
        mode: c.mode,
        lightsOn: c.lightsOn, suspectId: c.suspectId,
      })),
      suspects: ctx.suspects.slice(0, 8).map(s => ({
        playerId: s.playerId, name: s.name, x: s.x, z: s.z, speed: s.speed,
        driving: s.driving, wanted: s.wanted, lastCrimeAt: s.lastCrimeAt,
        lastKnownX: s.lastKnownX, lastKnownZ: s.lastKnownZ,
      })),
      world: ctx.world, escalate: ctx.escalate,
    });
    if (!goal || typeof goal.action !== 'string') return null;
    if (!['patrol', 'pursue', 'roadblock', 'standDown'].includes(goal.action)) return null;
    if (goal.action === 'pursue' && !goal.suspectId) return null;
    if (goal.action === 'roadblock' && (typeof goal.x !== 'number' || typeof goal.z !== 'number')) return null;
    return goal as AgentGoal;
  }
}

export interface AgentCop {
  id: string; role: string; x: number; z: number; yaw: number; speed: number;
  onFoot?: boolean; vehicleX?: number; vehicleZ?: number; lightsOn: boolean; pursuing: boolean;
}
/** Same deterministic authority offline; in rooms only server snapshots change truth. */
export class AgentSim {
  cops: AgentCop[] = [];
  walkers: PedAgent[] = [];
  sites: BuildSite[] = [];
  /** Street-racer rides (Maya vs Leo) rendered as vehicles. */
  rides: RideMsg[] = [];
  readonly outbox: CrimeReport[] = [];
  private now = 0;
  private lastSirenAt = -999;
  private wasSolo = false;
  private serverToken: string | null = null;
  private soloDirector = this.createDirector();
  /** Auth token for solo AI (set by WorldEngine from the login session; null = offline scripted). */
  setServerAiToken(token: string | null): void {
    this.serverToken = token && token.length > 0 ? token : null;
    // Rebuild so the next solo stretch picks up (or drops) the server brain.
    this.wasSolo = false;
  }
  private soloDialogue = async (context: DialogueContext): Promise<string[] | null> => {
    if (!this.serverToken) return null;
    return fetchDialogue(this.serverToken, {
      participants: context.participants.map(p => ({ id: p.id, name: p.name, role: p.role })),
      situation: context.situation, history: context.history,
    });
  };
  private createDirector(): AgentDirector {
    const scripted = new ScriptedDispatcher();
    // Online solo uses the server Gemini chain for tactics + chatter; the
    // scripted dispatcher stays as the instant fallback so the cop never stalls.
    if (this.serverToken) {
      return new AgentDirector({
        dialogue: this.soloDialogue,
        brain: new ServerDispatchBrain(() => this.serverToken),
        fallback: scripted, brainIntervalMs: 8000, now: () => this.now,
      });
    }
    return new AgentDirector({ brain: scripted, fallback: scripted, brainIntervalMs: 6000, now: () => this.now });
  }
  get pursuingNear(): boolean { return this.cops.some(c => c.pursuing); }
  applyServerState(a: AgentStateMsg, localId: string, sim: Simulation): void {
    this.cops = a.cops.map(c => ({ ...c, role: 'police', pursuing: c.mode === 'pursue' || c.mode === 'respond' }));
    this.walkers = (a.walkers ?? []).slice(0, 24).map(p => ({ ...p, outfit: { ...p.outfit } }));
    this.sites = (a.sites ?? []).map(s => ({ ...s }));
    this.rides = (a.rides ?? []).map(r => ({ ...r }));
    sim.wanted = a.wanted[localId] ?? 0;
    this.syncSimulation(sim);
  }
  applyBuildDelta(delta: BuildDelta, sim: Simulation): void {
    const index = Number(delta.siteId.slice(4)) - 1;
    const lot = BUILD_LOTS[index];
    if (!lot || delta.siteId !== 'lot-' + (index + 1) || !Number.isInteger(delta.stage) || delta.stage < 1 || delta.stage > 4) return;
    let site = this.sites.find(s => s.id === delta.siteId);
    if (site && site.stage >= delta.stage) return;
    if (!site) { site = { ...lot, id: delta.siteId, stage: 0, progress: 0 }; this.sites.push(site); }
    site.stage = delta.stage; site.progress = 0;
    this.syncSimulation(sim);
  }
  private syncSimulation(sim: Simulation): void {
    sim.builtBoxes = this.sites.filter(s => s.stage > 0).map(siteBox);
    sim.agentWalkers = this.walkers;
    sim.buildSites = this.sites;
  }
  applyServerEvent(e: AgentEventMsg, localId: string, sim: Simulation): void {
    if (e.kind === 'busted' && e.suspectId === localId) sim.busted();
  }
  clearRoomState(sim: Simulation): void {
    this.cops = []; this.walkers = []; this.sites = []; this.rides = []; this.outbox.length = 0;
    sim.wanted = 0; this.syncSimulation(sim); this.wasSolo = false;
    this.soloDirector.dispose(); this.soloDirector = this.createDirector();
  }
  dispose(): void { this.soloDirector.dispose(); }
  update(dt: number, sim: Simulation, solo: boolean, forward: boolean): void {
    const crimes = sim.drainCrimeEvents();
    if (forward) for (const c of crimes) this.outbox.push({ type: c.type, x: c.x, z: c.z });
    if (!solo) { this.wasSolo = false; return; }
    if (sim.phase !== 'playing' || sim.mode !== 'roam') return;
    this.now = sim.time * 1000;
    if (!this.wasSolo) { this.soloDirector.dispose(); this.soloDirector = this.createDirector(); this.wasSolo = true; }
    this.soloDirector.setMemberPos('solo', 'You', sim.x, sim.z, sim.driving ? Math.abs(sim.car.speed) : Math.hypot(sim.pvx, sim.pvz), sim.driving);
    for (const crime of crimes) this.soloDirector.reportCrime('solo', 'You', { ...crime, at: this.now });
    this.soloDirector.tick();
    this.applyServerState(this.soloDirector.getSnapshot(), 'solo', sim);
    this.soloDirector.world.construction.drainDeltas();
    for (const e of this.soloDirector.drainEvents()) this.applyServerEvent(e, 'solo', sim);
  }
  sirenDue(simTime: number): boolean {
    if (!this.pursuingNear || simTime - this.lastSirenAt < 4) return false;
    this.lastSirenAt = simTime; return true;
  }
}
