import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { WorldEngine, type QualityLevel } from '../world/WorldEngine';
import type { Theme } from '../game/State';
import type { WorldAction, WorldSnapshot } from '../world/Simulation';

const KEYS: Record<string, WorldAction> = { KeyW: 'forward', KeyS: 'back', KeyA: 'left', KeyD: 'right', ArrowUp: 'forward', ArrowDown: 'back', ArrowLeft: 'turnLeft', ArrowRight: 'turnRight', ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'jump' };
interface Props { engineRef: MutableRefObject<WorldEngine | null>; onSnapshot: (s: WorldSnapshot) => void; onMap: () => void; theme: Theme; quality: QualityLevel; portrait: boolean }

export function WorldViewport({ engineRef, onSnapshot, onMap, theme, quality, portrait }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const props = useRef({ onSnapshot, onMap, theme, quality, portrait }); props.current = { onSnapshot, onMap, theme, quality, portrait };
  const [error, setError] = useState('');
  useEffect(() => {
    const element = canvas.current!;
    let engine: WorldEngine;
    try { engine = new WorldEngine(element, s => props.current.onSnapshot(s)); }
    catch { setError('This map needs WebGL 2. Enable hardware acceleration or try a compatible browser.'); return; }
    engineRef.current = engine; engine.setTheme(props.current.theme); engine.applyQuality(props.current.quality);
    const resize = () => { const bounds = element.getBoundingClientRect(); engine.resize(bounds.width, bounds.height); };
    const observer = new ResizeObserver(resize); observer.observe(element);
    window.addEventListener('resize', resize); resize();
    const visibility = () => engine.setSuspended(document.hidden || props.current.portrait);
    const blur = () => { engine.clearInput(); if (engine.simulation.active) engine.togglePause(); };
    document.addEventListener('visibilitychange', visibility); window.addEventListener('blur', blur);
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.ctrlKey || event.altKey || event.metaKey || target.closest('input,textarea,select,[contenteditable="true"]')) return;
      if ((event.code === 'Space' || event.code === 'Enter') && target.closest('button')) return;
      if (KEYS[event.code]) { event.preventDefault(); if (!event.repeat) engine.input(KEYS[event.code], true, event.code); }
      if (!event.repeat) {
        if (event.code === 'KeyV') engine.toggleView();
        if (event.code === 'KeyE') { if (engine.simulation.mode === 'table') engine.tableSwing('drive'); else if (engine.simulation.mode === 'roam') engine.interact(); }
        if (event.code === 'KeyX') { if (engine.simulation.mode === 'table') engine.exitTable(); else if (engine.simulation.mode === 'basket') engine.exitBasket(); }
        if (event.code === 'KeyR') { if (engine.simulation.mode === 'table') engine.rematch(); else if (engine.simulation.mode === 'basket') engine.resetBasket(); }
        if (event.code === 'KeyM') props.current.onMap();
        if (event.code === 'KeyP' || event.code === 'Escape') engine.togglePause();
      }
    };
    const keyup = (event: KeyboardEvent) => { if (KEYS[event.code]) engine.input(KEYS[event.code], false, event.code); };
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
    let drag: { id: number; x: number; y: number } | null = null;
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || drag) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY }; element.setPointerCapture(event.pointerId); element.focus();
    };
    const move = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      engine.look(event.clientX - drag.x, event.clientY - drag.y); drag.x = event.clientX; drag.y = event.clientY;
    };
    const up = (event: PointerEvent) => { if (drag?.id === event.pointerId) drag = null; };
    const lost = (event: Event) => { event.preventDefault(); engine.setSuspended(true); setError('The graphics context was lost. Reload the map to continue.'); };
    element.addEventListener('pointerdown', down); element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up); element.addEventListener('pointercancel', up); element.addEventListener('lostpointercapture', up);
    element.addEventListener('webglcontextlost', lost);
    visibility();
    return () => {
      observer.disconnect(); window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', blur);
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup);
      element.removeEventListener('pointerdown', down); element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up); element.removeEventListener('pointercancel', up); element.removeEventListener('lostpointercapture', up);
      element.removeEventListener('webglcontextlost', lost); engine.destroy(); engineRef.current = null;
    };
  }, [engineRef]);
  useEffect(() => engineRef.current?.setTheme(theme), [theme, engineRef]);
  useEffect(() => engineRef.current?.applyQuality(quality), [quality, engineRef]);
  useEffect(() => engineRef.current?.setSuspended(document.hidden || portrait), [portrait, engineRef]);
  return <><canvas ref={canvas} tabIndex={0} className="world-canvas" aria-label="3D neighborhood. WASD to move, drag to look, V to switch camera, E to use car." />
    {error && <div className="world-error" role="alert"><h2>Unable to render the map</h2><p>{error}</p><button className="primary-button" onClick={() => location.reload()}>RELOAD</button></div>}</>;
}
