import { CameraInput, type LookSettings, type LookStatus } from '../game/CameraInput';
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { WorldEngine, type QualityLevel } from '../world/WorldEngine';
import type { Theme } from '../game/State';
import type { IntensityLevel, Season, Weather } from '../world/Weather';
import type { WorldAction, WorldSnapshot } from '../world/Simulation';

const KEYS: Record<string, WorldAction> = { KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right', ArrowUp: 'forward', ArrowDown: 'back', ArrowLeft: 'left', ArrowRight: 'right', KeyQ: 'turnLeft', KeyC: 'turnRight', ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'jump', KeyZ: 'signalLeft', KeyX: 'signalRight', KeyH: 'horn' };
interface Props { engineRef: MutableRefObject<WorldEngine | null>; onSnapshot: (s: WorldSnapshot) => void; onMap: () => void; theme: Theme; weather: Weather; season: Season; intensity: IntensityLevel; quality: QualityLevel; portrait: boolean; blocked: boolean; onDismissOverlay: () => void; lookSettings: LookSettings; lookEnabled: boolean }

export function WorldViewport({ engineRef, onSnapshot, onMap, theme, weather, season, intensity, quality, portrait, blocked, onDismissOverlay, lookSettings, lookEnabled }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const props = useRef({ onSnapshot, onMap, theme, quality, portrait, blocked, onDismissOverlay, lookSettings }); props.current = { onSnapshot, onMap, theme, quality, portrait, blocked, onDismissOverlay, lookSettings };
  const cameraInput = useRef<CameraInput | null>(null);
  const [lookStatus, setLookStatus] = useState<LookStatus>('free');
  const [error, setError] = useState('');
  useEffect(() => {
    const element = canvas.current!;
    let engine: WorldEngine;
    try { engine = new WorldEngine(element, s => { cameraInput.current?.refresh(); props.current.onSnapshot(s); }); }
    catch { setError('This map needs WebGL 2. Enable hardware acceleration or try a compatible browser.'); return; }
    engineRef.current = engine; engine.setTheme(props.current.theme); engine.applyQuality(props.current.quality);
    // E2E hook: heading/waypoint no longer render in the HUD, so tests read the sim directly.
    (window as unknown as { __worldEngine?: WorldEngine }).__worldEngine = engine;
    const resize = () => { const bounds = element.getBoundingClientRect(); engine.resize(bounds.width, bounds.height); };
    const observer = new ResizeObserver(resize); observer.observe(element);
    window.addEventListener('resize', resize); resize();
    const pause = () => { engine.clearInput(); if (engine.simulation.active) engine.togglePause(); cameraInput.current?.release(); };
    const look = new CameraInput(element, {
      enabled: () => engine.simulation.active && engine.simulation.mode === 'roam' && !props.current.blocked && !props.current.portrait && !document.hidden,
      settings: () => props.current.lookSettings,
      look: (dx, dy) => engine.look(dx, dy), pause, status: setLookStatus,
    });
    cameraInput.current = look;
    const visibility = () => { if (document.hidden) pause(); engine.setSuspended(document.hidden || props.current.portrait || props.current.blocked); look.refresh(); };
    const blur = pause;
    document.addEventListener('visibilitychange', visibility); window.addEventListener('blur', blur);
    const keydown = (event: KeyboardEvent) => {
      if (props.current.blocked) { if (event.code === 'Escape' && !event.repeat) props.current.onDismissOverlay(); return; }
      if (props.current.portrait || document.hidden) return;
      const target = event.target as HTMLElement;
      if (event.ctrlKey || event.altKey || event.metaKey || target.closest('input,textarea,select,[contenteditable="true"]')) return;
      if ((event.code === 'Space' || event.code === 'Enter') && target.closest('button')) return;
      if (KEYS[event.code]) { event.preventDefault(); if (!event.repeat) engine.input(KEYS[event.code], true, event.code); }
      if (!event.repeat) {
        // Enter-to-start is intentionally absent: a name is required, so entry
        // goes through the intro form (Enter inside the name field submits it).
        if (event.code === 'KeyN') engine.cycleVehicle();
        if (event.code === 'KeyT') engine.cycleWipers();
        if (event.code === 'KeyV') engine.toggleView();
        if (event.code === 'KeyE') { if (engine.simulation.mode === 'table') engine.tableSwing('drive'); else if (engine.simulation.mode === 'roam') engine.interact(); }
        if (event.code === 'KeyX') { if (engine.simulation.mode === 'table') engine.exitTable(); else if (engine.simulation.mode === 'basket') engine.exitBasket(); }
        if (event.code === 'KeyR') { if (engine.simulation.mode === 'table') engine.rematch(); else if (engine.simulation.mode === 'basket') engine.resetBasket(); }
        if (event.code === 'KeyM') props.current.onMap();
        if (event.code === 'KeyP') { engine.togglePause(); look.refresh(); }
        // Escape only pauses: pointerlockchange may already have handled browser Escape.
        if (event.code === 'Escape') pause();
      }
    };
    const keyup = (event: KeyboardEvent) => { if (KEYS[event.code]) engine.input(KEYS[event.code], false, event.code); };
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
    const lost = (event: Event) => { event.preventDefault(); engine.setSuspended(true); setError('The graphics context was lost. Reload the map to continue.'); };
    element.addEventListener('webglcontextlost', lost);
    visibility();
    return () => {
      observer.disconnect(); window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', blur);
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup);
      look.destroy(); cameraInput.current = null;
      element.removeEventListener('webglcontextlost', lost); engine.destroy(); engineRef.current = null;
      (window as unknown as { __worldEngine?: WorldEngine }).__worldEngine = undefined;
    };
  }, [engineRef]);
  useEffect(() => engineRef.current?.setTheme(theme), [theme, engineRef]);
  useEffect(() => engineRef.current?.setWeather(weather), [weather, engineRef]);
  useEffect(() => engineRef.current?.setSeason(season), [season, engineRef]);
  useEffect(() => engineRef.current?.setIntensityLevel(intensity), [intensity, engineRef]);
  useEffect(() => engineRef.current?.applyQuality(quality), [quality, engineRef]);
  useEffect(() => { engineRef.current?.setSuspended(document.hidden || portrait || blocked); cameraInput.current?.refresh(); }, [portrait, blocked, engineRef]);
  return <><canvas ref={canvas} tabIndex={0} className="world-canvas" data-look-state={lookStatus} aria-label="3D neighborhood. WASD or arrows to move, click once to capture mouse or trackpad look, Escape to release, touch swipe to look, Q/C to turn camera, Space to jump or handbrake, V for cockpit, E to enter or steal any stopped car, N to cycle 16 stopped vehicles. Type your name on the intro screen to start." />
    
    
    {error && <div className="world-error" role="alert"><h2>Unable to render the map</h2><p>{error}</p><button className="primary-button" onClick={() => location.reload()}>RELOAD</button></div>}</>;
}
