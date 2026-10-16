import { useEffect, useState } from 'react';
import { RaceModal } from './RaceModal';
import { VehiclePreview } from './VehiclePreview';
import type { WorldEngine } from '../world/WorldEngine';
import { formatRaceTime } from '../world/Track';
import { lightStage } from '../world/RaceSim';
import { F1_LENGTH, F1_ORIGIN, F1_HALF, f1AtPitBox, f1PathAt, f1Progress, f1InDrs } from '../world/F1Track';
import type { WorldSnapshot } from '../world/Simulation';
import { VEHICLES, VEHICLE_KINDS, type VehicleKind } from '../world/Vehicles';

/** Live standings panel (top-right, mobile-first, theme via CSS vars). */
export function RaceLeaderboard({ engine }: { engine: WorldEngine | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!engine || engine.race.phase === 'idle' || engine.race.phase === 'lobby') return null;
  const order = engine.race.standings();
  const laps = engine.race.laps;
  const trackLabel = engine.race.track === 'f1' ? 'F1 CIRCUIT' : 'CITY LOOP';
  return (
    <div className={'race-board' + (expanded ? ' mobile-expanded' : '')} role="status" aria-label="Live race leaderboard">
      <button type="button" className="mobile-race-summary" aria-label="Toggle race standings" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>
        <b>P{Math.max(1, order.findIndex(r => r.id === engine.raceId) + 1)}<small> / {order.length}</small></b>
        <span>LAP {order.find(r => r.id === engine.raceId)?.lap ?? 1} / {laps}</span><i aria-hidden="true">{expanded ? '?' : '+'}</i>
      </button>
      <b>RACE · {trackLabel} · {laps} LAP{laps > 1 ? 'S' : ''}</b>
      <ol>
        {order.map((r, i) => (
          <li key={r.id} className={r.id === engine.raceId ? 'me' : ''}>
            <span>P{i + 1}</span>
            <span className="race-name">{r.name.slice(0, 12)}</span>
            <span className="race-lap">L{r.lap}/{laps}</span>
            {r.finished && <span className="race-fin">FIN {formatRaceTime(r.finishMs)}</span>}
          </li>
        ))}
      </ol>
      <button className="control" onClick={() => engine.leaveRace()}>LEAVE RACE</button>
    </div>
  );
}

/** F1-style start lights: reds → amber-tinted count → green GO. Racing only. */
export function RaceCountdown({ engine }: { engine: WorldEngine | null }) {
  if (!engine || (engine.race.phase !== 'countdown' && !(engine.race.phase === 'racing' && Date.now() - engine.race.startedAt < 1000))) return null;
  const ms = Math.max(0, engine.race.countdownEndsAt - Date.now());
  const stage = lightStage(ms);
  return (
    <div className="race-countdown" role="status" aria-label="Race start lights">
      <div className="race-lights" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={i < stage.reds ? 'red on' : 'red'} />
        ))}
      </div>
      {stage.green ? (
        <><b className="go">GO</b><small className="go-sub">GREEN · GO GO GO</small></>
      ) : (
        <><b>{stage.num}</b><small>{stage.amber ? 'LIGHTS OUT SOON · HOLD GAS' : 'GET READY · HOLD GAS'}</small></>
      )}
    </div>
  );
}

/** Arena directory: host a race or join an advertised lobby in this server. */
export function RaceDirectory({ engine, inServer, raceCar, onCar, laps, onLaps, onClose, onJoined, onSwitchTab }: {
  engine: WorldEngine | null; inServer: boolean; raceCar: VehicleKind; onCar: (k: VehicleKind) => void;
  laps: number; onLaps: (n: number) => void; onClose: () => void; onJoined: () => void;
  onSwitchTab?: () => void;
}) {
  useEffect(() => {
    engine?.requestRaceDir();
    const t = window.setInterval(() => engine?.requestRaceDir(), 3000);
    return () => window.clearInterval(t);
  }, [engine]);
  if (!engine || engine.race.phase !== 'idle') return null;
  const races = engine.raceDir.filter((r) => (r.track ?? 'city') === 'city');
  const canHost = inServer;
  return (
    <RaceModal label="City racing multiplayer setup" onClose={onClose}>
      <div className="race-setup-head">
        <div><p className="eyebrow">NEON PADDOCK · TOKYO DRIFT MEET</p><h2>City racing</h2></div>
        <button className="control" onClick={onClose} aria-label="Close race directory">✕</button>
      </div>
      <div className="race-mode-tabs">
        {onSwitchTab && <button onClick={onSwitchTab}>Solo</button>}
        <button className="on" disabled>Multiplayer</button>
      </div>
      <p>City loop · traffic on · min 2 racers · host sets laps · all ready starts.</p>
      {!inServer && <p className="race-warn">Join a server first — race lobbies live inside your server code.</p>}
      {races.length > 0 ? (
        <div className="race-dir-list">
          <b>ACTIVE RACES · {races.length}</b>
          <ul>
            {races.map((r) => (
              <li key={r.hostId}>
                <div><b>{r.hostName}</b><small>{r.laps} LAP{r.laps > 1 ? 'S' : ''} · {r.count}/8 · {r.phase === 'countdown' ? 'STARTING' : 'LOBBY'}</small></div>
                <button className="control" disabled={!inServer || r.count >= 8 || r.phase !== 'lobby'} onClick={() => {
                  const e = engine;
                  if (!e) return;
                  if (e.joinRaceByHost(r.hostId, raceCar)) onJoined();
                }}>
                  {r.count >= 8 ? 'FULL' : r.phase !== 'lobby' ? 'LIVE' : 'JOIN'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="race-hint">{inServer ? 'No races yet — host the first one below.' : 'No directory offline. Join a server to see races.'}</p>
      )}
      <RaceCarPicker value={raceCar} onChange={onCar} />
      <div className="race-laps"><span>LAPS (HOST)</span>
        <button className="control" disabled={laps <= 1} onClick={() => onLaps(laps - 1)} aria-label="Fewer laps">−</button>
        <b>{laps}</b>
        <button className="control" disabled={laps >= 10} onClick={() => onLaps(laps + 1)} aria-label="More laps">+</button>
      </div>
      <div className="race-actions">
        <button className="primary-button" disabled={!canHost} onClick={() => {
          if (!engine) return;
          if (engine.createRace(laps, raceCar)) onJoined();
        }}>HOST RACE <span>→</span></button>
      </div>
      {!canHost && <small className="race-hint">Hosting needs a server — create or join one from the intro.</small>}
    </RaceModal>
  );
}

const CPU_COUNT_OPTIONS = [1, 2, 3] as const;
const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard'] as const;
const DIFFICULTY_LABELS: Record<string, string> = { easy: '🟢 EASY', medium: '🟡 MEDIUM', hard: '🔴 HARD' };

/** Solo race setup panel: car pick, CPU opponents, difficulty, laps, then race. No server needed. */
export function SoloRaceSetup({ engine, raceCar, onCar, laps, onLaps, onStart, onClose, onSwitchTab }: {
  engine: WorldEngine | null;
  raceCar: VehicleKind; onCar: (k: VehicleKind) => void;
  laps: number; onLaps: (n: number) => void;
  onStart: () => void; onClose: () => void;
  onSwitchTab?: () => void;
}) {
  const [cpuCount, setCpuCount] = useState(1);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  if (!engine || engine.race.phase !== 'idle') return null;
  return (
    <RaceModal label="City racing solo setup" onClose={onClose}>
      <div className="race-setup-head">
        <div>
          <p className="eyebrow">NEON PADDOCK · SOLO RACE</p>
          <h2>City racing</h2>
        </div>
        <button className="control" onClick={onClose} aria-label="Close solo race setup">✕</button>
      </div>
      <div className="race-mode-tabs">
        <button className="on" disabled>Solo</button>
        {onSwitchTab && <button onClick={onSwitchTab}>Multiplayer</button>}
      </div>
      <p>City loop · race CPU opponents offline · no server needed.</p>
      <RaceCarPicker value={raceCar} onChange={onCar} />
      <div className="race-option-row">
        <span>OPPONENTS</span>
        <div className="race-pill-group">
          {CPU_COUNT_OPTIONS.map((n) => (
            <button key={n} className={`control${cpuCount === n ? ' on' : ''}`} onClick={() => setCpuCount(n)} aria-pressed={cpuCount === n}>
              {n} {n === 1 ? 'driver' : 'drivers'}
            </button>
          ))}
        </div>
      </div>
      <div className="race-option-row">
        <span>DIFFICULTY</span>
        <div className="race-pill-group">
          {DIFFICULTY_OPTIONS.map((d) => (
            <button key={d} className={`control${difficulty === d ? ' on' : ''}`} onClick={() => setDifficulty(d)} aria-pressed={difficulty === d}>
              {DIFFICULTY_LABELS[d]}
            </button>
          ))}
        </div>
      </div>
      <div className="race-laps"><span>LAPS</span>
        <button className="control" disabled={laps <= 1} onClick={() => onLaps(laps - 1)} aria-label="Fewer laps">−</button>
        <b>{laps}</b>
        <button className="control" disabled={laps >= 10} onClick={() => onLaps(laps + 1)} aria-label="More laps">+</button>
      </div>
      <div className="race-actions">
        <button className="primary-button" onClick={() => {
          if (!engine) return;
          if (engine.startSoloRace(laps, raceCar, cpuCount, difficulty)) onStart();
        }}>
          RACE <span>→</span>
        </button>
      </div>
      <small className="race-hint">Your grid is ready. Choose a difficulty that suits your pace.</small>
    </RaceModal>
  );
}

const MEDALS = ['🥇', '🥈', '🥉'];
function formatGap(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  return `+${(ms / 1000).toFixed(1)}s`;
}

/** Toast for still-racing players when someone crosses the line. */
export function RaceFinishToast({ engine }: { engine: WorldEngine | null }) {
  if (!engine || engine.race.phase !== 'racing' || engine.race.localFinished || !engine.race.hasFinisher) return null;
  const winner = engine.race.firstFinisher;
  const me = engine.race.standings().findIndex((r) => r.id === engine.raceId) + 1;
  return (
    <div className="race-toast" role="status" aria-label="Race leader finished">
      🏁 {winner?.name ?? 'P1'} TAKES IT · YOU P{me} — KEEP PUSHING
    </div>
  );
}

/**
 * Finish celebration board. Live: appears for each finisher the moment they
 * cross the line (provisional, updates as others finish); final for everyone
 * once the race closes. Close exits cleanly back to free-roam city.
 */
export function RaceResults({ engine, onRematch, onExit }: { engine: WorldEngine | null; onRematch: () => void; onExit: () => void }) {
  if (!engine) return null;
  const final = engine.race.phase === 'finished';
  const provisional = engine.race.phase === 'racing' && engine.race.localFinished;
  if (!final && !provisional) return null;
  const results = engine.race.results();
  const me = results.find((r) => r.id === engine.raceId);
  const winner = results.find((r) => !r.dnf) ?? results[0];
  const fastest = results.reduce((best, r) => (r.bestLapMs > 0 && (!best || r.bestLapMs < best) ? r.bestLapMs : best), 0);
  const finishedCount = results.filter((r) => !r.dnf).length;
  const medalFor = (pos: number) => (pos <= 3 ? MEDALS[pos - 1] : `P${pos}`);
  const podium = [results[1], results[0], results[2]].filter(Boolean);
  return (
    <div className="race-results-cover">
      <div className="race-results win" role="dialog" aria-label={final ? 'Final race results' : 'Live race results'}>
        <div className="race-win-flag" aria-hidden="true" />
        <div className="race-win-head">
          <p className="eyebrow">{final ? '🏁 RACE COMPLETE' : '🏁 LIVE · FINISHERS COMING IN'}</p>
          <button className="control race-win-close" onClick={onExit} aria-label="Close results and drive free">✕</button>
        </div>
        <h2 className={me && me.position <= 3 && !me.dnf ? `pos-${me.position}` : ''}>
          {me ? (me.dnf ? `P${me.position} — DNF` : me.position === 1 ? '🏆 VICTORY — P1' : `P${me.position} — FINISHED`) : 'RACE OVER'}
        </h2>
        {winner && !winner.dnf && (
          <p className="race-win-sub">
            {engine.race.track === 'f1' ? 'F1 CIRCUIT · ' : ''}{engine.race.laps} LAP{engine.race.laps > 1 ? 'S' : ''} · WON IN {formatRaceTime(winner.totalMs)} · {finishedCount}/{results.length} FINISHED
          </p>
        )}
        {podium.length > 1 && (
          <div className="race-podium" aria-hidden="true">
            {podium.map((r) => (
              <div key={r.id} className={`podium-step p${r!.position}${r!.id === engine.raceId ? ' me' : ''}`}>
                <span className="podium-medal">{medalFor(r!.position)}</span>
                <b>{r!.name.slice(0, 10)}</b>
                <small>{r!.dnf ? 'DNF' : formatRaceTime(r!.totalMs)}</small>
              </div>
            ))}
          </div>
        )}
        <ol>
          {results.map((r) => {
            const stillRacing = !final && r.dnf;
            return (
              <li key={r.id} className={`${r.id === engine.raceId ? 'me' : ''}${r.position === 1 && !r.dnf ? ' winner' : ''}`}>
                <span className="race-pos">{medalFor(r.position)}</span>
                <div>
                  <b>{r.name}{r.id === engine.raceId ? ' · YOU' : ''}</b>
                  <small>
                    {r.dnf
                      ? (stillRacing ? `RACING · L${engine.race.racers.get(r.id)?.lap ?? 1}/${engine.race.laps}` : 'DNF')
                      : `${formatRaceTime(r.totalMs)} · GAP ${r.position === 1 ? '—' : formatGap(r.totalMs - (winner?.totalMs ?? 0))} · BEST ${formatRaceTime(r.bestLapMs)}`}
                  </small>
                </div>
                {r.bestLapMs > 0 && r.bestLapMs === fastest && !r.dnf && <i className="fastest" title="Fastest lap">⚡</i>}
                <i>{r.vehicleKind}</i>
              </li>
            );
          })}
        </ol>
        <div className="race-actions">
          {engine.race.isHost && final && <button className="primary-button" onClick={onRematch}>REMATCH <span>→</span></button>}
          <button className="control" onClick={onExit}>{final ? (engine.race.track === 'f1' ? 'BACK TO PADDOCK' : 'BACK TO CITY') : 'EXIT RACE'}</button>
        </div>
      </div>
    </div>
  );
}

interface LobbyProps {
  engine: WorldEngine | null;
  inServer: boolean;
  onNeedServer: () => void;
}

/** Paddock lobby: laps stepper (host), ready list, start (host, 2-8 all ready). */
export function RaceLobby({ engine, inServer, onNeedServer }: LobbyProps) {
  if (!engine || engine.race.phase === 'idle' || engine.race.phase === 'finished') return null;
  if (engine.race.phase !== 'lobby') return null;
  const racers = [...engine.race.racers.values()];
  const isHost = engine.race.isHost;
  const isF1 = engine.race.track === 'f1';
  return (
    <div className="race-lobby" role="dialog" aria-label="Race lobby">
      <div className="race-lobby-head">
        <div>
          <p className="eyebrow">{isF1 ? 'F1 CIRCUIT · RACE LOBBY' : 'NEON PADDOCK · RACE LOBBY'}</p>
          <b>{isF1 ? 'F1 · ' : ''}{racers.length}/8 RACERS · MIN 2 · ALL READY TO START</b>
        </div>
        <button className="control" onClick={() => engine.leaveRace()} aria-label="Leave race">✕</button>
      </div>
      {!inServer && (
        <p className="race-warn">Join a server first to race others — or host solo lobby and share the code. <button className="control" onClick={onNeedServer}>SERVERS</button></p>
      )}
      <div className="race-laps">
        <span>LAPS</span>
        <button className="control" disabled={!isHost || engine.race.laps <= 1} onClick={() => engine.setRaceLaps(engine.race.laps - 1)} aria-label="Fewer laps">−</button>
        <b>{engine.race.laps}</b>
        <button className="control" disabled={!isHost || engine.race.laps >= 10} onClick={() => engine.setRaceLaps(engine.race.laps + 1)} aria-label="More laps">+</button>
        {!isHost && <small>HOST SETS LAPS</small>}
      </div>
      <ul>
        {racers.map((r) => (
          <li key={r.id}>
            <span>{r.ready ? '●' : '○'}</span>
            <b>{r.name}</b>
            <small>{r.vehicleKind}</small>
            <i>{r.id === engine.race.hostId ? 'HOST' : r.ready ? 'READY' : 'WAITING'}</i>
          </li>
        ))}
      </ul>
      <div className="race-actions">
        <button className="primary-button" onClick={() => engine.toggleRaceReady()}>
          {(engine.race.racers.get(engine.raceId)?.ready ? 'NOT READY' : 'READY UP') + ' '}
          <span>✓</span>
        </button>
        {isHost && (
          <button className="primary-button" disabled={!engine.race.canStart} onClick={() => engine.startRaceCountdown()}>
            START RACE <span>→</span>
          </button>
        )}
      </div>
      {!engine.race.canStart && <small className="race-hint">Need at least 1 opponent (2 total) and everyone READY.</small>}
    </div>
  );
}

const PICKER_CATS = ['all', 'sport', 'car', 'suv', 'truck', 'van', 'service', 'bus'] as const;

/** Browse actual in-game vehicles with pointer, touch or keyboard arrows. */
export function RaceCarPicker({ value, onChange }: { value: VehicleKind; onChange: (k: VehicleKind) => void }) {
  const [cat, setCat] = useState<(typeof PICKER_CATS)[number]>('all');
  const [direction, setDirection] = useState(1);
  const kinds = VEHICLE_KINDS.filter(k => cat === 'all' || VEHICLES[k].category === cat);
  const index = kinds.indexOf(value);
  const spec = VEHICLES[value];
  const move = (step: number) => {
    setDirection(step);
    onChange(kinds[((index < 0 ? 0 : index) + step + kinds.length) % kinds.length]);
  };
  return <div className="race-picker">
    <div className="race-picker-label"><span>Your vehicle</span><span>{Math.max(0, index) + 1} / {kinds.length}</span></div>
    <div className="race-cats" aria-label="Vehicle category">
      {PICKER_CATS.map(c => <button type="button" key={c} aria-pressed={cat === c} className={cat === c ? 'on' : ''} onClick={() => {
        setCat(c); setDirection(1);
        const next = VEHICLE_KINDS.filter(k => c === 'all' || VEHICLES[k].category === c);
        if (!next.includes(value)) onChange(next[0]);
      }}>{c === 'all' ? 'All cars' : c === 'suv' ? 'SUV' : c.charAt(0).toUpperCase() + c.slice(1)}</button>)}
    </div>
    <div className="race-showroom" role="group" aria-label="Vehicle carousel" tabIndex={0} onKeyDown={event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); }
    }}>
      <button type="button" className="race-vehicle-arrow previous" onClick={() => move(-1)} aria-label="Previous vehicle" disabled={kinds.length < 2}>?</button>
      <VehiclePreview kind={value} direction={direction} />
      <button type="button" className="race-vehicle-arrow next" onClick={() => move(1)} aria-label="Next vehicle" disabled={kinds.length < 2}>?</button>
      <div className="race-vehicle-caption" aria-live="polite" aria-atomic="true"><h3>{spec.name}</h3><span>{spec.category === 'sport' ? 'Performance' : spec.category} / {spec.inspiredBy}</span></div>
    </div>
    <div className="race-vehicle-specs">
      <div><span>Top speed</span><b>{Math.round(spec.topSpeed * 3.6)} <small>km/h</small></b></div>
      <div><span>Acceleration</span><b>{spec.acceleration} <small>m/s?</small></b></div>
      <div><span>Handling</span><b>{spec.grip >= 9 ? 'Precise' : spec.grip >= 7 ? 'Balanced' : 'Heavy'}</b></div>
    </div>
  </div>;
}

/**
 * Final-lap top banner — REMOVED per design.
 * No floating top banner is rendered. Kept as a null stub so old imports
 * don't break.
 */
export function RaceFinalLapBanner({ engine }: { engine: WorldEngine | null }) {
  void engine;
  return null;
}

/**
 * Floating turn navigator HUD — REMOVED per design.
 * Turn guidance now lives on the road (3D chevrons / barricades / kerbs),
 * so no floating top pill is rendered. Kept as a null stub so old imports
 * don't break.
 */
export function RaceTurnNavigator({ engine }: { engine: WorldEngine | null }) {
  void engine;
  return null;
}

/** F1 portal directory: separate arena, same lobby workflow, island circuit. */
export function F1RaceDirectory({ engine, inServer, raceCar, onCar, laps, onLaps, onClose, onJoined, onSwitchTab }: {
  engine: WorldEngine | null; inServer: boolean; raceCar: VehicleKind; onCar: (k: VehicleKind) => void;
  laps: number; onLaps: (n: number) => void; onClose: () => void; onJoined: () => void;
  onSwitchTab?: () => void;
}) {
  useEffect(() => {
    engine?.requestRaceDir();
    const t = window.setInterval(() => engine?.requestRaceDir(), 3000);
    return () => window.clearInterval(t);
  }, [engine]);
  if (!engine || engine.race.phase !== 'idle') return null;
  const races = engine.raceDir.filter((r) => (r.track ?? 'city') === 'f1');
  const canHost = inServer;
  return (
    <RaceModal label="Formula racing multiplayer setup" onClose={onClose}>
      <div className="race-setup-head">
        <div><p className="eyebrow">F1 CIRCUIT · HILLSIDE ARENA</p><h2>Formula racing</h2></div>
        <button className="control" onClick={onClose} aria-label="Close F1 race directory">✕</button>
      </div>
      <div className="race-mode-tabs">
        {onSwitchTab && <button onClick={onSwitchTab}>Solo</button>}
        <button className="on" disabled>Multiplayer</button>
      </div>
      <p>F1 circuit · hills + DRS + pit lane · min 2 racers · host sets laps · all ready starts.</p>
      {!inServer && <p className="race-warn">Join a server first — F1 lobbies live inside your server code.</p>}
      {races.length > 0 ? (
        <div className="race-dir-list">
          <b>F1 RACES · {races.length}</b>
          <ul>
            {races.map((r) => (
              <li key={r.hostId}>
                <div><b>{r.hostName}</b><small>F1 · {r.laps} LAP{r.laps > 1 ? 'S' : ''} · {r.count}/8 · {r.phase === 'countdown' ? 'STARTING' : 'LOBBY'}</small></div>
                <button className="control" disabled={!inServer || r.count >= 8 || r.phase !== 'lobby'} onClick={() => {
                  if (engine.joinF1RaceByHost(r.hostId, raceCar)) onJoined();
                }}>
                  {r.count >= 8 ? 'FULL' : r.phase !== 'lobby' ? 'LIVE' : 'JOIN'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="race-hint">{inServer ? 'No F1 races yet — host the first one below.' : 'No directory offline. Join a server to see F1 races.'}</p>
      )}
      <RaceCarPicker value={raceCar} onChange={onCar} />
      <div className="race-laps"><span>LAPS (HOST)</span>
        <button className="control" disabled={laps <= 1} onClick={() => onLaps(laps - 1)} aria-label="Fewer laps">−</button>
        <b>{laps}</b>
        <button className="control" disabled={laps >= 10} onClick={() => onLaps(laps + 1)} aria-label="More laps">+</button>
      </div>
      <div className="race-actions">
        <button className="primary-button" disabled={!canHost} onClick={() => {
          if (engine.createF1Race(laps, raceCar)) onJoined();
        }}>HOST F1 RACE <span>→</span></button>
      </div>
      {!canHost && <small className="race-hint">Hosting needs a server — create or join one from the intro.</small>}
    </RaceModal>
  );
}

/** F1 solo setup: same options, island circuit, ERS + DRS. No server needed. */
export function F1SoloSetup({ engine, raceCar, onCar, laps, onLaps, onStart, onClose, onSwitchTab }: {
  engine: WorldEngine | null;
  raceCar: VehicleKind; onCar: (k: VehicleKind) => void;
  laps: number; onLaps: (n: number) => void;
  onStart: () => void; onClose: () => void;
  onSwitchTab?: () => void;
}) {
  const [cpuCount, setCpuCount] = useState(1);
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  if (!engine || engine.race.phase !== 'idle') return null;
  return (
    <RaceModal label="Formula racing solo setup" onClose={onClose}>
      <div className="race-setup-head">
        <div>
          <p className="eyebrow">F1 CIRCUIT · SOLO RACE</p>
          <h2>Formula racing</h2>
        </div>
        <button className="control" onClick={onClose} aria-label="Close F1 solo race setup">✕</button>
      </div>
      <div className="race-mode-tabs">
        <button className="on" disabled>Solo</button>
        {onSwitchTab && <button onClick={onSwitchTab}>Multiplayer</button>}
      </div>
      <p>F1 circuit · race CPU opponents offline · ERS boost + DRS on straights · pit lane repairs.</p>
      <RaceCarPicker value={raceCar} onChange={onCar} />
      <div className="race-option-row">
        <span>OPPONENTS</span>
        <div className="race-pill-group">
          {([1, 2, 3] as const).map((n) => (
            <button key={n} className={`control${cpuCount === n ? ' on' : ''}`} onClick={() => setCpuCount(n)} aria-pressed={cpuCount === n}>
              {n} {n === 1 ? 'driver' : 'drivers'}
            </button>
          ))}
        </div>
      </div>
      <div className="race-option-row">
        <span>DIFFICULTY</span>
        <div className="race-pill-group">
          {(['easy', 'medium', 'hard'] as const).map((d) => (
            <button key={d} className={`control${difficulty === d ? ' on' : ''}`} onClick={() => setDifficulty(d)} aria-pressed={difficulty === d}>
              {d === 'easy' ? '🟢 EASY' : d === 'medium' ? '🟡 MEDIUM' : '🔴 HARD'}
            </button>
          ))}
        </div>
      </div>
      <div className="race-laps"><span>LAPS</span>
        <button className="control" disabled={laps <= 1} onClick={() => onLaps(laps - 1)} aria-label="Fewer laps">−</button>
        <b>{laps}</b>
        <button className="control" disabled={laps >= 10} onClick={() => onLaps(laps + 1)} aria-label="More laps">+</button>
      </div>
      <div className="race-actions">
        <button className="primary-button" onClick={() => {
          if (engine.startSoloF1Race(laps, raceCar, cpuCount, difficulty)) onStart();
        }}>
          RACE F1 <span>→</span>
        </button>
      </div>
      <small className="race-hint">DRS opens on straights at full throttle. Pit lane caps speed and repairs when you stop.</small>
    </RaceModal>
  );
}

/** Circuit geometry is shared with the in-world road and race progress. */
const F1_MAP_POINTS = Array.from({ length: 241 }, (_, i) => {
  const p = f1PathAt(i / 240 * F1_LENGTH);
  return `${p.x - F1_ORIGIN.x},${p.z}`;
}).join(' ');

export function F1Hud({ drsOpen, inPitLane, racing, state, engine }: { drsOpen: boolean; inPitLane: boolean; racing: boolean; state: WorldSnapshot | null; engine: WorldEngine | null }) {
  if (!racing || !state) return null;
  const progress = f1Progress(state.car.x, state.car.z);
  const offTrack = !inPitLane && progress.lateral > F1_HALF + 1.2;
  const drsAvailable = f1InDrs(progress.lapDist) && !inPitLane && !offTrack;
  return (
    <aside className="f1-hud" aria-label="Circuit telemetry">
      <svg className="f1-map" viewBox="-285 -145 575 325" role="img" aria-label="Circuit map: you in red, opponents in cyan">
        <polyline points={F1_MAP_POINTS} fill="none" stroke="#60656a" strokeWidth="12" strokeLinejoin="round" />
        <polyline points={F1_MAP_POINTS} fill="none" stroke="#e3e7ea" strokeWidth="3" />
        <path d="M 0 -122 V -98" stroke="#ffffff" strokeWidth="5" />
        {engine?.raceMapOpponents.map(opponent => (
          <circle key={opponent.id} cx={opponent.x - F1_ORIGIN.x} cy={opponent.z} r="8" fill="#36d9ee" stroke="#152126" strokeWidth="3">
            <title>{opponent.name}</title>
          </circle>
        ))}
        <circle cx={state.car.x - F1_ORIGIN.x} cy={state.car.z} r="9" fill="#ff354f" stroke="#fff" strokeWidth="3"><title>You</title></circle>
      </svg>
      <div className="f1-telemetry"><strong>{Math.round(Math.abs(state.car.speed) * 3.6)}<small>KM/H</small></strong><span>{(F1_LENGTH / 1000).toFixed(2)} KM<br />{Math.round(progress.lapDist / F1_LENGTH * 100)}% LAP</span></div>
      <div className="f1-status" role="status">
        <span className={drsOpen ? 'f1-drs' : ''}>{drsOpen ? 'DRS OPEN' : drsAvailable ? 'DRS ZONE' : 'DRS CLOSED'}</span>
        {inPitLane && <span className="f1-pit">PIT LIMIT 80 KM/H</span>}
        {inPitLane && f1AtPitBox(progress) && Math.abs(state.car.speed) < 0.5 && <span className="f1-pit">PIT BOX</span>}
        {offTrack && <span className="f1-warning">OFF TRACK</span>}
      </div>
      <label className="f1-energy">ERS <meter min={0} max={150} value={state.boost} aria-label="ERS charge" />{Math.round(Math.min(150, state.boost) / 1.5)}%</label>
    </aside>
  );
}


