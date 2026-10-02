import { useEffect, useState } from 'react';
import type { WorldEngine } from '../world/WorldEngine';
import { formatRaceTime } from '../world/Track';
import { lightStage } from '../world/RaceSim';
import { VEHICLES, VEHICLE_KINDS, type VehicleKind } from '../world/Vehicles';

/** Live standings panel (top-right, mobile-first, theme via CSS vars). */
export function RaceLeaderboard({ engine }: { engine: WorldEngine | null }) {
  if (!engine || engine.race.phase === 'idle' || engine.race.phase === 'lobby') return null;
  const order = engine.race.standings();
  const laps = engine.race.laps;
  return (
    <div className="race-board" role="status" aria-label="Live race leaderboard">
      <b>RACE · {laps} LAP{laps > 1 ? 'S' : ''}</b>
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
export function RaceDirectory({ engine, inServer, raceCar, onCar, laps, onLaps, onClose, onJoined }: {
  engine: WorldEngine | null; inServer: boolean; raceCar: VehicleKind; onCar: (k: VehicleKind) => void;
  laps: number; onLaps: (n: number) => void; onClose: () => void; onJoined: () => void;
}) {
  useEffect(() => {
    engine?.requestRaceDir();
    const t = window.setInterval(() => engine?.requestRaceDir(), 3000);
    return () => window.clearInterval(t);
  }, [engine]);
  if (!engine || engine.race.phase !== 'idle') return null;
  const races = engine.raceDir;
  const canHost = inServer;
  return (
    <div className="race-setup" role="dialog" aria-label="Neon paddock race directory">
      <div className="race-setup-head">
        <div><p className="eyebrow">NEON PADDOCK · TOKYO DRIFT MEET</p><h2>Line up 8 cars.</h2></div>
        <button className="control" onClick={onClose} aria-label="Close race directory">✕</button>
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
    </div>
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
            {engine.race.laps} LAP{engine.race.laps > 1 ? 'S' : ''} · WON IN {formatRaceTime(winner.totalMs)} · {finishedCount}/{results.length} FINISHED
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
          <button className="control" onClick={onExit}>{final ? 'BACK TO CITY' : 'EXIT RACE'}</button>
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
  return (
    <div className="race-lobby" role="dialog" aria-label="Race lobby">
      <div className="race-lobby-head">
        <div>
          <p className="eyebrow">NEON PADDOCK · RACE LOBBY</p>
          <b>{racers.length}/8 RACERS · MIN 2 · ALL READY TO START</b>
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

/** Car picker grid for the race form (keeps own chosen car). Category tabs keep 46 rides browsable. */
export function RaceCarPicker({ value, onChange }: { value: VehicleKind; onChange: (k: VehicleKind) => void }) {
  const [cat, setCat] = useState<(typeof PICKER_CATS)[number]>('all');
  const kinds = VEHICLE_KINDS.filter((k) => cat === 'all' || VEHICLES[k].category === cat);
  return (
    <div>
      <div className="race-cats" role="tablist" aria-label="Filter by category">
        {PICKER_CATS.map((c) => (
          <button key={c} role="tab" aria-selected={cat === c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>
            {c.toUpperCase()}
          </button>
        ))}
      </div>
      <div className="race-cars" role="radiogroup" aria-label="Choose your race car">
        {kinds.map((k) => (
          <button key={k} role="radio" aria-checked={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
            <b>{VEHICLES[k].name}</b>
            <small>{VEHICLES[k].topSpeed * 3.6 | 0} km/h</small>
          </button>
        ))}
      </div>
    </div>
  );
}
