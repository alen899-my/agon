import { useState } from 'react';
import { DEFAULT_LOOK, type LookSettings } from '../game/CameraInput';
import type { Theme } from '../game/State';
import type { WorldSnapshot } from '../world/Simulation';
import type { IntensityLevel, Season, Weather } from '../world/Weather';
import type { QualityLevel } from '../world/WorldEngine';

export type MenuTab = 'display' | 'camera' | 'world' | 'game';

const TABS: { id: MenuTab; label: string }[] = [
  { id: 'display', label: 'DISPLAY' },
  { id: 'camera', label: 'CAMERA' },
  { id: 'world', label: 'WORLD' },
  { id: 'game', label: 'GAME' },
];

const THEMES: { id: Theme; label: string; icon: string }[] = [
  { id: 'light', label: 'Day', icon: '◑' },
  { id: 'color', label: 'Color', icon: '●' },
  { id: 'dark', label: 'Night', icon: '◐' },
];

const QUALITIES: { id: QualityLevel; label: string }[] = [
  { id: 'low', label: 'LOW' },
  { id: 'balanced', label: 'BALANCED' },
  { id: 'high', label: 'HIGH' },
  { id: 'ultra', label: 'ULTRA' },
];

const WEATHERS: { id: Weather; label: string; icon: string }[] = [
  { id: 'normal', label: 'Clear', icon: '☀' },
  { id: 'rain', label: 'Rain', icon: '🌧' },
  { id: 'snow', label: 'Snow', icon: '❄' },
];

const SEASONS: { id: Season; label: string; icon: string }[] = [
  { id: 'spring', label: 'Spring', icon: '🌸' },
  { id: 'summer', label: 'Summer', icon: '☀' },
  { id: 'autumn', label: 'Autumn', icon: '🍂' },
  { id: 'winter', label: 'Winter', icon: '❄' },
];

interface Props {
  theme: Theme;
  onTheme: (t: Theme) => void;
  weather: Weather;
  onWeather: (w: Weather) => void;
  season: Season;
  onSeason: (s: Season) => void;
  intensity: IntensityLevel;
  onIntensity: (n: IntensityLevel) => void;
  quality: QualityLevel;
  onQuality: (q: QualityLevel) => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  view: 'third' | 'first' | undefined;
  onToggleView: () => void;
  look: LookSettings;
  onLook: (l: LookSettings) => void;
  onOpenMap: () => void;
  physicsOpen: boolean;
  onTogglePhysics: () => void;
  paused: boolean;
  pauseDisabled: boolean;
  onTogglePause: () => void;
  roomCode: string | null;
  roomMembers: number;
  roomName: string | null;
  roomVisibility: 'public' | 'private' | null;
  copied: boolean;
  onCopyCode: () => void;
  onLeaveServer: () => void;
  snapshot: WorldSnapshot | null;
  onClose: () => void;
}

function Segmented<T extends string | number>({ label, options, value, onPick, namePrefix }: {
  label: string;
  options: { id: T; label: string; icon?: string }[];
  value: T;
  onPick: (id: T) => void;
  namePrefix: string;
}) {
  return (
    <div className="menu-row">
      <span className="menu-label">{label}</span>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.id}
            role="radio"
            aria-checked={value === o.id}
            aria-label={`${o.label} ${namePrefix}`}
            className={value === o.id ? 'on' : ''}
            onClick={() => onPick(o.id)}
          >
            {o.icon && <span aria-hidden="true">{o.icon} </span>}{o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function GameMenu(props: Props) {
  const [tab, setTab] = useState<MenuTab>('display');
  const snap = props.snapshot;
  const stage = snap?.mode === 'table' ? 'GAME CENTER — TABLE TENNIS' : snap?.mode === 'basket' ? 'GAME CENTER — HOOPS' : 'STAGE 01 — THE NEIGHBORHOOD';
  return (
    <div className="menu-cover">
      <div className="menu-sheet" role="dialog" aria-modal="true" aria-label="Game settings">
        <div className="menu-heading">
          <h2>SETTINGS</h2>
          <button className="control" autoFocus onClick={props.onClose} aria-label="Close settings">✕</button>
        </div>
        <div className="menu-tabs" role="tablist" aria-label="Settings sections">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="menu-body" role="tabpanel">
          {tab === 'display' && <>
            <Segmented label="Theme" options={THEMES} value={props.theme} onPick={props.onTheme} namePrefix="theme" />
            <Segmented label="Weather" options={WEATHERS} value={props.weather} onPick={props.onWeather} namePrefix="weather" />
            <Segmented label="Season" options={SEASONS} value={props.season} onPick={props.onSeason} namePrefix="season" />
            <Segmented
              label="Intensity"
              options={([1, 2, 3, 4, 5] as IntensityLevel[]).map(n => ({ id: n, label: String(n) }))}
              value={props.intensity}
              onPick={props.onIntensity}
              namePrefix="intensity"
            />
            <p className="menu-hint">Intensity 1 softens rain, snow and sunlight; 5 pushes all three to the extreme. 3 is the classic look.</p>
            <Segmented label="Graphics" options={QUALITIES} value={props.quality} onPick={props.onQuality} namePrefix="graphics" />
            <p className="menu-hint">Graphics sets pixel sharpness and shadow detail. Lower it if the frame rate drops. Saved on this device.</p>
            <div className="menu-row">
              <span className="menu-label">Fullscreen</span>
              <button className="control" onClick={props.onToggleFullscreen} aria-label={props.fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
                {props.fullscreen ? '⛶ EXIT' : '⛶ ENTER'}
              </button>
            </div>
          </>}
          {tab === 'camera' && <>
            <Segmented
              label="Perspective"
              options={[{ id: 'third', label: '3RD PERSON' }, { id: 'first', label: '1ST PERSON' }] as { id: 'third' | 'first'; label: string }[]}
              value={props.view ?? 'third'}
              onPick={(id) => { if (id !== (props.view ?? 'third')) props.onToggleView(); }}
              namePrefix="view"
            />
            <p className="menu-hint">Mouse / laptop: click the world once, then move without holding a button. Escape releases the cursor. Q / C also turn the camera. Touch: swipe the world with a free finger.</p>
            <label className="menu-slider">
              <span>Mouse / trackpad sensitivity <output>{props.look.pointer.toFixed(2)}x</output></span>
              <input aria-label="Mouse and trackpad sensitivity" type="range" min="0.25" max="3" step="0.05" value={props.look.pointer}
                onChange={(event) => props.onLook({ ...props.look, pointer: Number(event.target.value) })} />
            </label>
            <label className="menu-slider">
              <span>Touch sensitivity <output>{props.look.touch.toFixed(2)}x</output></span>
              <input aria-label="Touch look sensitivity" type="range" min="0.25" max="3" step="0.05" value={props.look.touch}
                onChange={(event) => props.onLook({ ...props.look, touch: Number(event.target.value) })} />
            </label>
            <div className="menu-row">
              <span className="menu-label">Invert vertical look</span>
              <button role="switch" aria-checked={props.look.invertY} aria-label="Invert vertical look" className={`switch${props.look.invertY ? ' on' : ''}`}
                onClick={() => props.onLook({ ...props.look, invertY: !props.look.invertY })}>
                <span aria-hidden="true" />
              </button>
            </div>
            <div className="menu-row">
              <span className="menu-label">Defaults</span>
              <button className="control" onClick={() => props.onLook({ ...DEFAULT_LOOK })}>RESET CAMERA</button>
            </div>
          </>}
          {tab === 'world' && <>
            <div className="menu-row">
              <span className="menu-label">District map</span>
              <button className="control" onClick={props.onOpenMap} aria-label="Open full map">OPEN MAP</button>
            </div>
            <div className="menu-row">
              <span className="menu-label">Physics checklist</span>
              <button className="control" onClick={props.onTogglePhysics} aria-expanded={props.physicsOpen} aria-label="Physics checklist">
                {props.physicsOpen ? 'HIDE' : 'SHOW'}
              </button>
            </div>
            <div className="menu-section">SERVER</div>
            {props.roomCode ? <>
              <div className="menu-row">
                <span className="menu-label">{props.roomVisibility === 'public' ? '🌐 Public' : '🔒 Private'} · {props.roomMembers} player{props.roomMembers === 1 ? '' : 's'}</span>
                <b className="menu-code">{props.roomCode}</b>
              </div>
              {props.roomName && <p className="menu-hint">{props.roomName}</p>}
              <div className="menu-actions">
                <button className="control" onClick={props.onCopyCode}>{props.copied ? 'COPIED ✓' : 'COPY CODE'}</button>
                <button className="control" onClick={props.onLeaveServer}>LEAVE SERVER</button>
              </div>
            </> : <p className="menu-hint">Solo world. Create or join a server from the intro screen to play together.</p>}
          </>}
          {tab === 'game' && <>
            <div className="menu-row">
              <span className="menu-label">{props.paused ? 'Paused' : 'Running'}</span>
              <button className="control" disabled={props.pauseDisabled} onClick={props.onTogglePause} aria-label={props.paused ? 'Resume' : 'Pause'}>
                {props.paused ? '▶ RESUME' : 'Ⅱ PAUSE'}
              </button>
            </div>
            <div className="menu-section">THIS SESSION</div>
            <div className="menu-row">
              <span className="menu-label">{stage}</span>
              <b className="menu-stat">{snap?.distance ?? 0} m</b>
            </div>
            <div className="menu-section">CONTROLS</div>
            <ul className="menu-controls">
              {snap?.mode === 'table'
                ? <><li><span>AUTO MOVE</span><i>●</i></li><li><span>Hit</span><i>SPACE</i></li><li><span>Topspin</span><i>W</i></li><li><span>Chop</span><i>S</i></li><li><span>Smash</span><i>SHIFT</i></li></>
                : snap?.mode === 'basket'
                ? <><li><span>Pump</span><i>TAP SPACE</i></li><li><span>Throw</span><i>TAP AGAIN</i></li></>
                : snap?.driving
                ? <><li><span>Gas / Brake</span><i>W / S</i></li><li><span>Steer</span><i>A / D</i></li><li><span>Drift</span><i>SPACE</i></li><li><span>Cockpit</span><i>V</i></li><li><span>Exit</span><i>E</i></li><li><span>Wipers</span><i>T</i></li><li><span>16 rides</span><i>N</i></li></>
                : <><li><span>Move</span><i>W A S D</i></li><li><span>Sprint</span><i>SHIFT</i></li><li><span>Jump</span><i>SPACE</i></li><li><span>Steal any car</span><i>E</i></li></>}
            </ul>
          </>}
        </div>
      </div>
    </div>
  );
}
