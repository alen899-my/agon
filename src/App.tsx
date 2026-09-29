import { useEffect, useRef, useState } from 'react';
import { ThemeToggle } from './components/ThemeToggle';
import { WorldViewport } from './components/WorldViewport';
import { WorldControls } from './components/WorldControls';
import { DistrictMap } from './components/DistrictMap';
import { PLACES } from './world/Map';
import type { WorldEngine } from './world/WorldEngine';
import type { WorldSnapshot } from './world/Simulation';

type Theme = 'light' | 'dark';
function initialTheme(): Theme {
  try { const saved = localStorage.getItem('agon-theme'); if (saved === 'light' || saved === 'dark') return saved; } catch { /* Optional storage. */ }
  return 'light';
}
const portraitQuery = '(orientation: portrait) and (max-width: 1000px)';
export default function App() {
  const engine = useRef<WorldEngine | null>(null);
  const [state, setState] = useState<WorldSnapshot | null>(null);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [portrait, setPortrait] = useState(() => matchMedia(portraitQuery).matches);
  const [mapOpen, setMapOpen] = useState(false);
  const resumeAfterMap = useRef(false);
  const [notice, setNotice] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const media = matchMedia(portraitQuery);
    const rotate = () => setPortrait(media.matches);
    const full = () => setFullscreen(Boolean(document.fullscreenElement));
    media.addEventListener('change', rotate); document.addEventListener('fullscreenchange', full);
    return () => { media.removeEventListener('change', rotate); document.removeEventListener('fullscreenchange', full); };
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark'); document.documentElement.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#111111' : '#f4f4f4');
    try { localStorage.setItem('agon-theme', theme); } catch { /* Optional storage. */ }
  }, [theme]);
  const focus = () => document.querySelector<HTMLCanvasElement>('canvas')?.focus();
  const toggleMap = () => {
    if (!mapOpen) { resumeAfterMap.current = engine.current?.simulation.active ?? false; if (resumeAfterMap.current) engine.current?.togglePause(); }
    else if (resumeAfterMap.current && engine.current?.simulation.paused) engine.current.togglePause();
    setMapOpen(!mapOpen);
  };
  const enterFullscreen = async () => {
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); return; }
      if (!document.documentElement.requestFullscreen) { setNotice('Fullscreen is not available here. Rotate your phone to landscape to explore.'); return; }
      await document.documentElement.requestFullscreen();
      const orientation = screen.orientation as ScreenOrientation & { lock?: (value: string) => Promise<void> };
      try { await orientation.lock?.('landscape'); } catch { /* Manual rotation works too. */ }
    } catch { setNotice('Fullscreen was unavailable. You can explore in this window.'); }
  };
  const ready = !state || state.phase === 'ready';
  const active = !ready && !state?.paused && !portrait && !mapOpen;
  const destination = PLACES.find(p => p.id === state?.waypoint);
  const distance = destination && state ? Math.round(Math.hypot(destination.x - state.x, destination.z - state.z)) : null;
  const heading = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((state?.yaw ?? 0) * 180 / Math.PI + 3600) / 45) % 8];
  return <main className="district-shell">
    <header className="district-header">
      <div className="wordmark">agon<span>↗</span><div>OPEN<br />DISTRICT</div></div>
      <div className="header-center"><span className="tiny-dot" /> A WORLD IN MONOCHROME</div>
      <nav aria-label="Game settings">
        <button className="control" onClick={enterFullscreen} aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>⛶</button>
        <ThemeToggle theme={theme} onChange={setTheme} />
        <button className="control" onClick={() => engine.current?.toggleView()} aria-label="Switch camera view">{state?.view === 'first' ? '1ST PERSON' : '3RD PERSON'} <kbd>V</kbd></button>
        <button className="control" onClick={toggleMap} aria-expanded={mapOpen}>MAP <kbd>M</kbd></button>
        <button className="control" disabled={ready || mapOpen} onClick={() => { engine.current?.togglePause(); focus(); }} aria-label={state?.paused ? 'Resume' : 'Pause'}>{state?.paused ? '▶' : 'Ⅱ'}</button>
      </nav>
    </header>
    <section className="world-stage" aria-label="Open world neighborhood">
      <WorldViewport engineRef={engine} onSnapshot={setState} onMap={toggleMap} theme={theme} portrait={portrait} />
      <div className="location-card"><span className="eyebrow">DISTRICT 01 / FREE ROAM</span><h2>{ready ? 'The neighborhood.' : state?.location}</h2><p>{ready ? 'A small place. A thousand directions.' : state?.driving ? 'Behind the wheel. Make your own route.' : 'No hurry. Take the long way home.'}</p></div>
      <div className="compass"><span>W</span><b>{heading}</b><span>E</span><i /></div>
      {!ready && <div className="exploration-count"><b>{state?.discovered.length ?? 0}<span> / 6</span></b><small>PLACES DISCOVERED</small></div>}
      {ready && <div className="world-intro">
        <p className="eyebrow">THE FIRST BLOCK OF SOMETHING BIGGER</p>
        <h1>OUTSIDE.<br />IS YOURS.</h1>
        <p>A living little district, built from simple things.<br />Walk its streets. Meet its rhythm. Find your place.</p>
        <button className="primary-button" disabled={!state} onClick={() => { engine.current?.begin(); focus(); }}>EXPLORE DISTRICT <span>↗</span></button>
        <div className="intro-tags"><span>6 LOCATIONS</span><span>2 PERSPECTIVES</span><span>NO RUSH</span></div>
      </div>}
      {!ready && <>
        <div className="look-hint">{state?.view === 'first' ? 'FIRST PERSON' : 'THIRD PERSON'}<span>DRAG THE WORLD TO LOOK AROUND</span></div>
        {state?.view === 'first' && <div className="crosshair" aria-hidden="true">+</div>}
        <button className="minimap-button" onClick={toggleMap} aria-label="Open district map"><DistrictMap state={state} /><div><b>{state?.driving ? `${state.speed} KM/H` : 'YOUR NEIGHBORHOOD'}</b><span>↗</span></div></button>
        <div className="destination"><span>◇</span><div><b>{destination?.name ?? 'Choose a destination'}</b><small>{distance !== null ? `${distance} m away` : 'Open the map to set a waypoint'}</small></div></div>
        {(state?.nearbyCar || state?.driving) && <button className="interact-button" onClick={() => { engine.current?.interact(); focus(); }}>{state.driving ? 'EXIT VEHICLE' : 'DRIVE THIS CAR'} <kbd>E</kbd></button>}
        <WorldControls disabled={!active} driving={state?.driving ?? false} onStick={(x, y) => engine.current?.joystick(x, y)} onInput={(action, down, source) => engine.current?.input(action, down, source)} />
      </>}
      {state?.paused && !mapOpen && <div className="pause-cover"><div><p className="eyebrow">THE CITY CAN WAIT</p><h2>A moment to yourself.</h2><button className="primary-button" onClick={() => { engine.current?.togglePause(); focus(); }}>KEEP EXPLORING <span>→</span></button></div></div>}
      {mapOpen && <div className="map-cover"><div className="map-sheet" role="dialog" aria-labelledby="map-title">
        <div className="map-heading"><div><p className="eyebrow">224 × 224 METERS / ONE CONNECTED NEIGHBORHOOD</p><h2 id="map-title">Make your own way.</h2></div><button className="control" onClick={toggleMap} aria-label="Close map">✕</button></div>
        <div className="map-content"><DistrictMap state={state} large /><div className="place-list">{PLACES.map((place, index) => <button key={place.id} onClick={() => { engine.current?.waypoint(place.id); toggleMap(); focus(); }}>
          <span>{String(index + 1).padStart(2, '0')}</span><div><small>{place.category}</small><b>{place.name}</b><p>{place.description}</p></div><i>{state?.discovered.includes(place.id) ? '✓' : '↗'}</i>
        </button>)}</div></div>
        <p className="map-caption">Select a place to set a waypoint. Walk or drive there to discover it.</p>
      </div></div>}
      {portrait && <div className="rotate-cover"><span className="rotate-symbol">↻</span><p className="eyebrow">MORE ROOM TO EXPLORE</p><h2>Turn your world.</h2><p>Rotate your phone to landscape.<br />Your neighborhood will be waiting.</p><button className="primary-button" onClick={enterFullscreen}>GO FULLSCREEN <span>⛶</span></button></div>}
    </section>
    <footer className="district-footer"><span>W A S D <i>MOVE</i> · SHIFT <i>SPRINT</i> · SPACE <i>JUMP</i></span><span>STAGE 01 — THE NEIGHBORHOOD</span><span>{state?.distance ?? 0} m EXPLORED</span></footer>
    {notice && <div className="notice" role="status">{notice}<button className="control" onClick={() => setNotice('')}>Dismiss</button></div>}
  </main>;
}
