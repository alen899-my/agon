import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Engine } from '../game/Engine';
import type { Action, Snapshot, Theme } from '../game/State';

interface Props {
  engineRef: MutableRefObject<Engine | null>;
  onSnapshot: (snapshot: Snapshot) => void;
  theme: Theme;
  portrait: boolean;
}
const KEYS: Record<string, Action> = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyJ: 'punch', KeyX: 'punch' };

export function GameCanvas({ engineRef, onSnapshot, theme, portrait }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const callbackRef = useRef(onSnapshot);
  const themeRef = useRef(theme);
  const portraitRef = useRef(portrait);
  const [error, setError] = useState('');
  callbackRef.current = onSnapshot; themeRef.current = theme; portraitRef.current = portrait;
  useEffect(() => {
    const canvas = canvasRef.current!;
    let engine: Engine;
    try { engine = new Engine(canvas, snapshot => callbackRef.current(snapshot)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Canvas unavailable.'); return; }
    engineRef.current = engine;
    engine.setTheme(themeRef.current);
    const resize = () => { const box = canvas.getBoundingClientRect(); engine.resize(box.width, box.height); };
    const observer = new ResizeObserver(resize); observer.observe(canvas);
    window.addEventListener('resize', resize);
    let density: MediaQueryList;
    const watchDensity = () => {
      density?.removeEventListener('change', watchDensity);
      density = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      density.addEventListener('change', watchDensity); resize();
    };
    watchDensity();
    const visibility = () => engine.setSuspended(document.hidden || portraitRef.current);
    const blur = () => {
      engine.clearInput();
      if (engine.snapshot.phase === 'playing' && !engine.snapshot.paused) engine.togglePause();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('blur', blur);
    const keydown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if ((event.code === 'Space' || event.code === 'Enter') && target.closest('button')) return;
      if (event.code === 'Escape' || event.code === 'KeyP') {
        if (!event.repeat) engine.togglePause(); return;
      }
      const action = KEYS[event.code];
      if (action) { event.preventDefault(); if (!event.repeat) engine.input(action, true, `key:${event.code}`); }
    };
    const keyup = (event: KeyboardEvent) => {
      const action = KEYS[event.code];
      if (action) engine.input(action, false, `key:${event.code}`);
    };
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
    visibility();
    return () => {
      engine.destroy(); engineRef.current = null; observer.disconnect();
      density.removeEventListener('change', watchDensity);
      window.removeEventListener('resize', resize); window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup);
    };
  }, [engineRef]);
  useEffect(() => { engineRef.current?.setTheme(theme); }, [engineRef, theme]);
  useEffect(() => { engineRef.current?.setSuspended(document.hidden || portrait); }, [engineRef, portrait]);
  return <>
    <canvas ref={canvasRef} className="game-canvas" tabIndex={0}
      aria-label="Stickman obstacle course. Move with A/D or arrows, jump with Space, punch with J. Touch controls are below.">
      Canvas support is required to play.
    </canvas>
    {error && <div className="error-overlay" role="alert">{error}</div>}
  </>;
}
