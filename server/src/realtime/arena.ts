import { TableTennisSim } from '../shared/TableTennis.js';
import { BasketballSim } from '../shared/Basketball.js';
import type { ArenaAction, ArenaLobby, ArenaState } from '../shared/arena.js';
interface Peer { playerId: string; name: string }
interface Match { state: ArenaState; table: TableTennisSim; basket: BasketballSim; timer: ReturnType<typeof setInterval> | null; lastAction: number; shotPause: number; turnDeadline:number }
/** Room-scoped, server-owned sports simulation. Clients send actions, never scores. */
export class ArenaRoom {
  private matches = new Map<string, Match>();
  constructor(private send: (id: string, state: ArenaState | null) => void, private directory: (lobbies: ArenaLobby[]) => void) {}
  list(): void { this.directory([...this.matches.values()].map(({state: s}) => ({ hostId:s.hostId, game:s.game, phase:s.phase, players:s.players }))); }
  private find(id: string): Match | undefined { return [...this.matches.values()].find(m => m.state.players.some(p => p.id === id)); }
  private push(m: Match): void { for (const p of m.state.players) this.send(p.id, { ...m.state, table: m.state.game === 'table' ? m.table.snapshot : undefined, basket: m.state.game === 'basket' ? m.basket.snapshot : undefined }); }
  leave(id: string): void {
    const m = this.find(id); if (!m) return;
    if (m.timer) clearInterval(m.timer);
    for (const p of m.state.players) this.send(p.id, null);
    this.matches.delete(m.state.hostId); this.list();
  }
  action(peer: Peer, raw: unknown): void {
    if (!raw || typeof raw !== 'object') return;
    const a = raw as ArenaAction;
    if (a.action === 'list') { this.list(); return; }
    if (a.action === 'leave') { this.leave(peer.playerId); return; }
    let m = this.find(peer.playerId);
    if (a.action === 'host' && !m && (a.game === 'table' || a.game === 'basket')) {
      m = { state: { hostId: peer.playerId, game: a.game, phase:'lobby', players:[{id:peer.playerId,name:peer.name,ready:false,score:0,shots:0}], turn:0,message:'Waiting for an opponent' }, table:new TableTennisSim(),basket:new BasketballSim(),timer:null,lastAction:Date.now(),shotPause:0,turnDeadline:0 };
      m.table.multiplayer = true; this.matches.set(peer.playerId,m); this.push(m); this.list(); return;
    }
    if (a.action === 'join' && !m && typeof a.hostId === 'string') {
      m = this.matches.get(a.hostId); if (!m || m.state.phase !== 'lobby' || m.state.players.length !== 1) return;
      m.state.players.push({id:peer.playerId,name:peer.name,ready:false,score:0,shots:0}); m.state.message='Both players must ready up'; this.push(m); this.list(); return;
    }
    if (!m) return;
    const index = m.state.players.findIndex(p => p.id === peer.playerId);
    if (a.action === 'ready' && m.state.phase === 'lobby') { m.state.players[index].ready = !m.state.players[index].ready; this.push(m); this.list(); }
    if (a.action === 'start' && peer.playerId === m.state.hostId && m.state.players.length === 2 && m.state.players.every(p => p.ready) && m.state.phase !== 'playing') {
      m.table.reset(); m.basket.resetStats(); m.basket.setRack(0); m.basket.setupHold(true); m.basket.rate=0.85; m.basket.greenHalf=0.025;
      m.state.players.forEach(p => { p.score=0;p.shots=0; }); m.state.turn=0; m.shotPause=0; m.turnDeadline=Date.now()+20000; m.state.phase='playing'; m.lastAction=Date.now();
      const match=m; m.timer=setInterval(() => this.tick(match), 1000/30); this.list(); this.push(m);
    }
    if(a.action==='configure' && m.state.phase==='playing' && Number.isFinite(a.aim) && Math.abs(a.aim!)<=1) {
      if(m.state.game==='table') m.table.setAim(a.aim!,index===0?'you':'ai');
      else if(index===m.state.turn && a.style && ['jump','arc','quick'].includes(a.style)) m.basket.configure(a.style,a.aim!);
      this.push(m);
    }
    if (a.action === 'shot' && m.state.phase === 'playing') {
      m.lastAction=Date.now();
      if (m.state.game === 'table' && ['drive','topspin','chop','smash','serve'].includes(a.shot ?? 'drive')) {
        if (index === 0) m.table.swingPlayer(a.shot ?? 'drive'); else m.table.swingRemote(a.shot ?? 'drive');
      } else if (m.state.game === 'basket' && index === m.state.turn) m.basket.pressMeter();
    }
  }
  private tick(m: Match): void {
    if (Date.now()-m.lastAction > 120000) { this.leave(m.state.hostId); return; }
    if (m.state.game === 'table') {
      m.table.update(1/30); m.state.players[0].score=m.table.you; m.state.players[1].score=m.table.aiScore;
      m.state.message=m.table.server === 'you' ? `${m.state.players[0].name} serves` : `${m.state.players[1].name} serves`;
      if (m.table.matchOver) m.state.phase='finished';
    } else {
      m.state.shotClock=m.basket.phase==='hold'?Math.max(0,Math.ceil((m.turnDeadline-Date.now())/1000)):0;
      if(m.basket.phase==='hold' && Date.now()>=m.turnDeadline) m.basket.shoot(Math.max(0.05,m.basket.power));
      if(m.basket.phase !== 'done') m.basket.update(1/30);
      m.state.message=`${m.basket.release ? m.basket.release+' ? ' : ''}${m.state.players[m.state.turn].name}'s shot � 10 shots each`;
      if (m.basket.phase === 'done') {
        m.shotPause+=1/30;
        if(m.shotPause<1.2) { this.push(m); return; }
        m.shotPause=0;
        const p=m.state.players[m.state.turn]; p.shots++; if(m.basket.scored) p.score+=m.basket.shotValue;
        if (m.state.players.every(p => p.shots >= 10)) m.state.phase='finished';
        else { m.state.turn=1-m.state.turn; m.turnDeadline=Date.now()+20000; m.basket.setSpot(4.2,0); m.basket.setupHold(true); m.basket.rate=0.85; m.basket.greenHalf=0.025; }
      }
    }
    if (m.state.phase === 'finished') {
      if(m.timer) clearInterval(m.timer); m.timer=null;
      const [a,b]=m.state.players; m.state.message=a.score===b.score?'Draw � rematch?':`${a.score>b.score?a.name:b.name} wins`; this.list();
    }
    this.push(m);
  }
}
