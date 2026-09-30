import { DEFAULT_LOOK, readLookSettings } from './game/CameraInput';
import { VEHICLES } from './world/Vehicles';
﻿import { useEffect, useRef, useState } from 'react';
import { ThemeToggle } from './components/ThemeToggle';
import { QualityToggle } from './components/QualityToggle';
import { WorldViewport } from './components/WorldViewport';
import { WorldControls } from './components/WorldControls';
import { TableTennisControls } from './components/TableTennisControls';
import { BasketballControls } from './components/BasketballControls';
import { DistrictMap } from './components/DistrictMap';
import { PhysicsChecklist } from './components/PhysicsChecklist';
import { PLACES } from './world/Map';
import type { Theme } from './game/State';
import type { WorldEngine, QualityLevel } from './world/WorldEngine';
import type { WorldSnapshot } from './world/Simulation';

function initialTheme(): Theme {
  try { const saved = localStorage.getItem('agon-theme'); if (saved === 'light' || saved === 'dark' || saved === 'color') return saved; } catch { /* Optional storage. */ }
  return 'light';
}
function initialQuality(): QualityLevel {
  try {
    const saved = localStorage.getItem('agon-quality');
    if (saved === 'low' || saved === 'balanced' || saved === 'high' || saved === 'ultra') return saved;
  } catch { /* Optional storage. */ }
  return 'balanced';
}
const portraitQuery = '(orientation: portrait) and (max-width: 1000px)';
export default function App() {
  const engine = useRef<WorldEngine | null>(null);
  const [state, setState] = useState<WorldSnapshot | null>(null);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [quality, setQuality] = useState<QualityLevel>(initialQuality);
  const [portrait, setPortrait] = useState(() => matchMedia(portraitQuery).matches);
  const [mapOpen, setMapOpen] = useState(false);
  const resumeAfterMap = useRef(false);
  const [notice, setNotice] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [physicsOpen, setPhysicsOpen] = useState(false);
  const [lookOpen, setLookOpen] = useState(false);
  const [lookSettings, setLookSettings] = useState(readLookSettings);
  useEffect(() => { try { localStorage.setItem('agon-look', JSON.stringify(lookSettings)); } catch { /* Optional storage. */ } }, [lookSettings]);
  useEffect(() => {
    const media = matchMedia(portraitQuery);
    const rotate = () => setPortrait(media.matches);
    const full = () => setFullscreen(Boolean(document.fullscreenElement));
    media.addEventListener('change', rotate); document.addEventListener('fullscreenchange', full);
    return () => { media.removeEventListener('change', rotate); document.removeEventListener('fullscreenchange', full); };
  }, []);
  useEffect(() => {
    const dark = theme === 'dark';
    document.documentElement.classList.toggle('dark', dark); document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111111' : '#f4f4f4');
    try { localStorage.setItem('agon-theme', theme); } catch { /* Optional storage. */ }
  }, [theme]);
  useEffect(() => {
    try { localStorage.setItem('agon-quality', quality); } catch { /* Optional storage. */ }
  }, [quality]);
  const focus = () => document.querySelector<HTMLCanvasElement>('canvas')?.focus();
  const toggleMap = () => {
    if (!mapOpen) { resumeAfterMap.current = engine.current?.simulation.active ?? false; if (resumeAfterMap.current) engine.current?.togglePause(); }
    else if (resumeAfterMap.current && engine.current?.simulation.paused) engine.current.togglePause();
    setMapOpen(!mapOpen);
  };
  const enterFullscreen = async () => {
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); return; }
      const stage = document.querySelector('.world-stage') as HTMLElement | null;
      const target = stage ?? document.documentElement;
      if (!target.requestFullscreen) { setNotice('Fullscreen is not available here. Rotate your phone to landscape to explore.'); return; }
      // Request fullscreen on the world stage so only the game world shows (no header/footer/menus).
      await target.requestFullscreen();
      const orientation = screen.orientation as ScreenOrientation & { lock?: (value: string) => Promise<void> };
      try { await orientation.lock?.('landscape'); } catch { /* Manual rotation works too. */ }
    } catch { setNotice('Fullscreen was unavailable. You can explore in this window.'); }
  };
  const ready = !state || state.phase === 'ready';
  const active = !ready && !state?.paused && !portrait && !mapOpen && !physicsOpen && !lookOpen;
  return <main className={`district-shell${fullscreen ? ' is-fullscreen' : ''}`}>
    <header className="district-header">
      <div className="wordmark">agon<span>↗</span><div>OPEN<br />DISTRICT</div></div>
      <div className="header-center"><span className="tiny-dot" /> {theme === 'color' ? 'A WORLD IN FULL COLOR' : 'A WORLD IN MONOCHROME'}</div>
      <nav aria-label="Game settings">
        <button className="control" onClick={enterFullscreen} aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>⛶</button>
        <ThemeToggle theme={theme} onChange={setTheme} />
        <QualityToggle quality={quality} onChange={setQuality} />
        <button className="control" onClick={() => setLookOpen(true)} aria-label="Camera controls and sensitivity">LOOK</button>
        <button className="control" onClick={() => engine.current?.toggleView()} aria-label="Switch camera view">{state?.view === 'first' ? '1ST PERSON' : '3RD PERSON'} <kbd>V</kbd></button>
        <button className="control" onClick={toggleMap} aria-expanded={mapOpen}>MAP <kbd>M</kbd></button>
        <button className="control" onClick={() => setPhysicsOpen(!physicsOpen)} aria-expanded={physicsOpen} aria-label="Physics checklist">⚙ PHYSICS</button>
        <button className="control" disabled={ready || mapOpen} onClick={() => { engine.current?.togglePause(); focus(); }} aria-label={state?.paused ? 'Resume' : 'Pause'}>{state?.paused ? '▶' : 'Ⅱ'}</button>
      </nav>
    </header>
    <section className={`world-stage${state?.driving ? ' is-driving' : ''}`} aria-label="Open world neighborhood">
      <WorldViewport engineRef={engine} onSnapshot={setState} onMap={toggleMap} theme={theme} quality={quality} portrait={portrait} blocked={mapOpen || physicsOpen || lookOpen}
        onDismissOverlay={() => { if (lookOpen) setLookOpen(false); else if (physicsOpen) setPhysicsOpen(false); else if (mapOpen) toggleMap(); }}
        lookSettings={lookSettings} lookEnabled={active && state?.mode === 'roam'} />
      {fullscreen && <button className="fullscreen-exit" onClick={enterFullscreen} aria-label="Exit fullscreen">⛶ EXIT</button>}
      {ready && <div className="world-intro">
        <p className="eyebrow">THE FIRST BLOCK OF SOMETHING BIGGER</p>
        <h1>OUTSIDE.<br />IS YOURS.</h1>
        <p>A living little district, built from simple things.<br />Walk its streets. Meet its rhythm. Find your place.</p>
        <button className="primary-button" disabled={!state} onClick={() => { engine.current?.begin(); focus(); }}>EXPLORE DISTRICT <span>↗</span></button>
        <div className="intro-tags"><span>7 LOCATIONS</span><span>2 PERSPECTIVES</span><span>NO RUSH</span></div>
      </div>}
      {!ready && <>
        {state?.driving && <div className="hud-top" role="status" aria-label="Map and speed">
          <button className="hud-map" onClick={toggleMap} aria-label="Open district map"><DistrictMap state={state} theme={theme} /></button>
          <div className="hud-speed" aria-label="Speed"><b>{state?.speed ?? 0}<small>KM/H</small></b><span>{VEHICLES[state.vehicleKind].name} · {state.acceleration.toFixed(1)} m/s^2{(state?.damage ?? 0) > 0 ? ` · DMG ${state?.damage}%` : ''}</span><button className="hud-cycle" disabled={!active || Math.abs(state?.car.speed ?? 0) > 0.2} onClick={() => { engine.current?.cycleVehicle(); focus(); }} aria-label="Next vehicle">⇄</button></div>
        </div>}
        {state?.view === 'first' && <div className="crosshair" aria-hidden="true">+</div>}
        {state?.impact && <div className="crash-flash" role="status">CRASH · {state.impact.speed} KM/H vs {state.impact.with.toUpperCase()}</div>}
        {state?.mode === 'table' && state.table && <div className="tt-score" role="status" aria-label={`Table tennis score you ${state.table.you} AI ${state.table.aiScore}`}>
          <div><small>YOU</small><b>{state.table.you}</b>{state.table.server === 'you' && <i>●</i>}</div>
          <div className="tt-mid"><span>{state.table.phase === 'over' ? 'MATCH' : `RALLY ${state.table.rally}`}</span><small>{state.table.ballSpeedKmh} KM/H</small></div>
          <div><small>AI</small><b>{state.table.aiScore}</b>{state.table.server === 'ai' && <i>●</i>}</div>
        </div>}
        {state?.mode === 'table' && state?.table && <div className="tt-message" role="status">{state.table.message}</div>}
        {state?.mode === 'table' && state?.table?.matchOver && <button className="interact-button" onClick={() => { engine.current?.rematch(); focus(); }}>REMATCH <kbd>R</kbd></button>}
        {state?.mode === 'table' && <button className="tt-exit" onClick={() => { engine.current?.exitTable(); focus(); }} aria-label="Exit table tennis">✕ EXIT <kbd>X</kbd></button>}
        {state?.mode === 'basket' && state.basket && <div className="tt-score" role="status" aria-label={`Hoops ${state.basket.makes} of ${state.basket.attempts}`}>
          <div><small>MAKES</small><b>{state.basket.makes}/{state.basket.attempts}</b></div>
          <div className="tt-mid"><span>{state.basket.spotLabel}</span><small>STREAK {state.basket.streak} · BEST {state.basket.best}</small></div>
          <div className="bb-meter" aria-label={`Power ${Math.round(state.basket.power * 100)} percent`}><i style={{ height: `${Math.round(state.basket.power * 100)}%` }} /><em className="bb-green" style={{ bottom: `${Math.round(state.basket.greenLo * 100)}%`, height: `${Math.max(2, Math.round((state.basket.greenHi - state.basket.greenLo) * 100))}%` }} /><span>{Math.round(state.basket.power * 100)}</span></div>
        </div>}
        {state?.mode === 'basket' && state?.basket?.message && <div className="tt-message" role="status">{state.basket.message}</div>}
        {state?.mode === 'basket' && <button className="tt-exit" onClick={() => { engine.current?.exitBasket(); focus(); }} aria-label="Exit hoops">✕ EXIT <kbd>X</kbd></button>}
        {state?.mode === 'roam' && state?.nearHoop && !state?.driving && <button className="interact-button bb-play" onClick={() => { engine.current?.enterBasket(); focus(); }}>SHOOT HOOPS <kbd>E</kbd></button>}
        {state?.mode !== 'table' && state?.mode !== 'basket' && (state?.nearbyCar || state?.driving || (state?.nearTable && !state?.driving)) && <button className="interact-button" onClick={() => { if (state?.nearTable && !state?.driving) engine.current?.enterTable(); else engine.current?.interact(); focus(); }}>{state.driving ? 'EXIT VEHICLE' : state?.nearTable && !state?.nearbyCar ? 'PLAY TABLE TENNIS' : (state?.enterHint ?? 'DRIVE')} <kbd>E</kbd></button>}
        {state?.mode === 'table'
          ? <TableTennisControls disabled={!active} onSwing={shot => engine.current?.tableSwing(shot)} />
          : state?.mode === 'basket'
          ? <BasketballControls disabled={!active} pumping={state?.basket?.pumping ?? false} onTap={() => engine.current?.basketTap()} />
          : <WorldControls disabled={!active} driving={state?.driving ?? false} speed={state?.car.speed ?? 0} onStick={(x, y) => engine.current?.joystick(x, y)} onInput={(action, down, source) => engine.current?.input(action, down, source)} />}
      </>}
      {state?.paused && !mapOpen && !physicsOpen && !lookOpen && <div className="pause-cover"><div><p className="eyebrow">THE CITY CAN WAIT</p><h2>A moment to yourself.</h2><button className="primary-button" onClick={() => { engine.current?.togglePause(); focus(); }}>KEEP EXPLORING <span>→</span></button></div></div>}
      {mapOpen && <div className="map-cover"><div className="map-sheet" role="dialog" aria-labelledby="map-title">
        <div className="map-heading"><div><p className="eyebrow">224 × 224 METERS / ONE CONNECTED NEIGHBORHOOD</p><h2 id="map-title">Make your own way.</h2></div><button className="control" onClick={toggleMap} aria-label="Close map">✕</button></div>
        <div className="map-content"><DistrictMap state={state} large theme={theme} /><div className="place-list">{PLACES.map((place, index) => <button key={place.id} onClick={() => { engine.current?.waypoint(place.id); toggleMap(); focus(); }}>
          <span>{String(index + 1).padStart(2, '0')}</span><div><small>{place.category}</small><b>{place.name}</b><p>{place.description}</p></div><i>{state?.discovered.includes(place.id) ? '✓' : '↗'}</i>
        </button>)}</div></div>
        <p className="map-caption">Select a place to set a waypoint. Walk or drive there to discover it.</p>
      </div></div>}
      {lookOpen && <div className="map-cover"><div className="look-settings" role="dialog" aria-modal="true" aria-labelledby="look-title">
        <div className="map-heading"><h2 id="look-title">Camera controls</h2><button className="control" autoFocus onClick={() => setLookOpen(false)} aria-label="Close camera settings">CLOSE</button></div>
        <p>Mouse / laptop: click the world once, then move without holding a button. Escape releases the cursor and pauses. Q / C also turn the camera.</p>
        <p>Touch: swipe the world with a free finger while moving or steering with the other hand.</p>
        <label>Mouse / trackpad sensitivity <output>{lookSettings.pointer.toFixed(2)}x</output><input aria-label="Mouse and trackpad sensitivity" type="range" min="0.25" max="3" step="0.05" value={lookSettings.pointer} onChange={event => setLookSettings({ ...lookSettings, pointer: Number(event.target.value) })} /></label>
        <label>Touch sensitivity <output>{lookSettings.touch.toFixed(2)}x</output><input aria-label="Touch look sensitivity" type="range" min="0.25" max="3" step="0.05" value={lookSettings.touch} onChange={event => setLookSettings({ ...lookSettings, touch: Number(event.target.value) })} /></label>
        <label className="invert-look"><input type="checkbox" checked={lookSettings.invertY} onChange={event => setLookSettings({ ...lookSettings, invertY: event.target.checked })} /> Invert vertical look</label>
        <button className="control" onClick={() => setLookSettings({ ...DEFAULT_LOOK })}>RESET CAMERA SETTINGS</button>
      </div></div>}
      {physicsOpen && !ready && <div className="physics-cover"><div className="physics-sheet" role="dialog" aria-label="Physics checklist"><div className="map-heading"><div><p className="eyebrow">REALISTIC PHYSICS · ONE BY ONE</p><h2>Systems online.</h2></div><button className="control" onClick={() => setPhysicsOpen(false)} aria-label="Close physics">✕</button></div><PhysicsChecklist state={state} /><p className="map-caption">Drive into walls, traffic and crowds to tick crash events. Repair at South Station.</p></div></div>}
      {portrait && <div className="rotate-cover"><span className="rotate-symbol">↻</span><p className="eyebrow">MORE ROOM TO EXPLORE</p><h2>Turn your world.</h2><p>Rotate your phone to landscape.<br />Your neighborhood will be waiting.</p><button className="primary-button" onClick={enterFullscreen}>GO FULLSCREEN <span>⛶</span></button></div>}
    </section>
    <footer className="district-footer"><span>{state?.mode === 'table' ? <>AUTO MOVE <i>●</i> · SPACE <i>HIT</i> · W <i>TOP</i> · S <i>CHOP</i> · SHIFT <i>SMASH</i></> : state?.mode === 'basket' ? <>TAP SPACE <i>PUMP</i> · TAP AGAIN <i>THROW</i></> : state?.driving ? <>W / S <i>GAS / BRAKE</i> | A / D <i>STEER</i> | SPACE <i>DRIFT</i> | V <i>COCKPIT</i> | E <i>EXIT</i> | N <i>16 RIDES</i></> : <>W A S D <i>MOVE</i> · SHIFT <i>SPRINT</i> · SPACE <i>JUMP</i> · E <i>STEAL ANY CAR</i></>}</span><span>{state?.mode === 'table' ? 'GAME CENTER — TABLE TENNIS' : state?.mode === 'basket' ? 'GAME CENTER — HOOPS' : 'STAGE 01 — THE NEIGHBORHOOD'}</span><span>{state?.distance ?? 0} m EXPLORED</span></footer>
    {notice && <div className="notice" role="status">{notice}<button className="control" onClick={() => setNotice('')}>Dismiss</button></div>}
  </main>;
}
