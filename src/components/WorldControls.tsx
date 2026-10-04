import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { WiperMode, WorldAction } from '../world/Simulation';

interface Props { disabled: boolean; driving: boolean; speed: number; wiperMode: WiperMode; boost: number; boosting: boolean; racing: boolean; onStick: (x: number, y: number) => void; onInput: (action: WorldAction, down: boolean, source: string) => void; onWipers: () => void }
export function WorldControls({ disabled, driving, speed, wiperMode, boost, boosting, racing, onStick, onInput, onWipers }: Props) {
  const pointer = useRef<number | null>(null); const [stick, setStick] = useState({ x: 0, y: 0 });
  const callbacks = useRef({ onStick, onInput }); callbacks.current = { onStick, onInput };
  const sources = useRef(new Map<string, WorldAction>());
  const speedRef = useRef(speed); speedRef.current = speed;
  // Brake doubles as drift: companion handbrake sources owned by each brake pointer.
  const driftSources = useRef(new Set<string>());
  useEffect(() => {
    const reset = () => {
      callbacks.current.onStick(0, 0); pointer.current = null; setStick({ x: 0, y: 0 });
      for (const [source, action] of sources.current) callbacks.current.onInput(action, false, source);
      sources.current.clear();
      for (const drift of driftSources.current) callbacks.current.onInput('handbrake', false, drift);
      driftSources.current.clear();
    };
    const media = matchMedia('(hover: hover) and (pointer: fine)');
    reset(); media.addEventListener('change', reset); window.addEventListener('blur', reset);
    return () => { reset(); media.removeEventListener('change', reset); window.removeEventListener('blur', reset); };
  }, [driving, disabled]);
  const releaseDrive = (event: PointerEvent<HTMLButtonElement>) => {
    const source = 'drive:' + event.pointerId, action = sources.current.get(source);
    if (action) callbacks.current.onInput(action, false, source);
    sources.current.delete(source);
    // Release the drift companion owned by a brake pointer, if any.
    const drift = source + ':drift';
    if (driftSources.current.has(drift)) { callbacks.current.onInput('handbrake', false, drift); driftSources.current.delete(drift); }
  };
  const pressDrive = (event: PointerEvent<HTMLButtonElement>, action: WorldAction) => {
    if (disabled) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    const source = 'drive:' + event.pointerId;
    sources.current.set(source, action); callbacks.current.onInput(action, true, source);
    // Mobile brake acts as drift while moving: hold handbrake alongside brake.
    // Released automatically near standstill (see effect below) so reverse still works.
    if (action === 'back' && Math.abs(speedRef.current) > 2) {
      const drift = source + ':drift';
      driftSources.current.add(drift); callbacks.current.onInput('handbrake', true, drift);
    }
  };
  // Ease off the drift companion as the car stops so a held brake flows into reverse.
  useEffect(() => {
    if (Math.abs(speed) < 1 && driftSources.current.size > 0) {
      for (const drift of [...driftSources.current]) { callbacks.current.onInput('handbrake', false, drift); driftSources.current.delete(drift); }
    }
  }, [speed]);
  const driveButton = (action: WorldAction, arrow: string, sub: string, aria: string) => <button key={action} className="drive-pad" disabled={disabled} aria-label={aria}
    onContextMenu={event => event.preventDefault()}
    onPointerDown={event => pressDrive(event, action)}
    onPointerUp={releaseDrive} onPointerCancel={releaseDrive} onLostPointerCapture={releaseDrive}>
    <span className="drive-arrow" aria-hidden="true">{arrow}</span><small>{sub}</small></button>;
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== event.pointerId || disabled) return;
    const rect = event.currentTarget.getBoundingClientRect(), radius = rect.width * 0.32;
    let x = (event.clientX - rect.left - rect.width / 2) / radius, y = (event.clientY - rect.top - rect.height / 2) / radius;
    const length = Math.max(1, Math.hypot(x, y)); x /= length; y /= length;
    setStick({ x: x * radius, y: y * radius }); onStick(x, y);
  };
  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null; setStick({ x: 0, y: 0 }); onStick(0, 0);
  };
  if (driving) return <div className={`world-controls driving-controls ${disabled ? 'inactive' : ''}`}>
    <div className="drive-steering">{driveButton('left', '◀', 'LEFT', 'Steer left')}{driveButton('right', '▶', 'RIGHT', 'Steer right')}</div>
    <div className="drive-pedals">
      {racing && <div className="boost-wrap">
        <div className="boost-meter" role="progressbar" aria-label={`Boost ${Math.round(boost)} percent`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(boost)}>
          <i style={{ width: `${Math.round(boost)}%` }} className={boosting ? 'hot' : ''} />
        </div>
        <button className={`drive-pad boost-pad${boosting ? ' on' : ''}`} disabled={disabled || boost <= 1} aria-label="Nitro boost (hold)"
          onContextMenu={event => event.preventDefault()}
          onPointerDown={event => pressDrive(event, 'sprint')}
          onPointerUp={releaseDrive} onPointerCancel={releaseDrive} onLostPointerCapture={releaseDrive}>
          <span className="drive-arrow" aria-hidden="true">⚡</span><small>{boosting ? 'BOOST!' : `BOOST ${Math.round(boost)}%`}</small></button>
      </div>}
      {driveButton('back', '▼', 'BRAKE', 'Brake')}{driveButton('forward', '▲', 'GAS', 'Gas')}
      <button className="drive-pad" disabled={disabled} aria-label="Honk horn"
        onContextMenu={event => event.preventDefault()}
        onPointerDown={event => { if (!disabled) { event.preventDefault(); onInput('horn', true, `pad:${event.pointerId}`); } }}
        onPointerUp={event => onInput('horn', false, `pad:${event.pointerId}`)} onPointerCancel={event => onInput('horn', false, `pad:${event.pointerId}`)}>
        <span className="drive-arrow" aria-hidden="true">🔊</span><small>HORN</small></button>
      <button className={`drive-pad${wiperMode !== 'auto' ? ' on' : ''}`} disabled={disabled} aria-label={`Wipers ${wiperMode}`}
        onContextMenu={event => event.preventDefault()}
        onPointerDown={event => { if (!disabled) { event.preventDefault(); onWipers(); } }}>
        <span className="drive-arrow" aria-hidden="true">{wiperMode === 'off' ? '🚫' : '💧'}</span><small>WIPER{wiperMode === 'auto' ? '' : ` ${wiperMode.toUpperCase()}`}</small></button>
    </div>
  </div>;
  return <div className={`world-controls ${disabled ? 'inactive' : ''}`}>
    <div className="stick-wrap"><div className="joystick" aria-label="Movement joystick" role="group"
      onPointerDown={event => {
        if (disabled || pointer.current !== null) return;
        event.preventDefault(); pointer.current = event.pointerId; event.currentTarget.setPointerCapture(event.pointerId); move(event);
      }} onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
      <span className="stick-guides">＋</span><span className="stick-knob" style={{ transform: `translate(${disabled ? 0 : stick.x}px, ${disabled ? 0 : stick.y}px)` }} />
    </div><span className="control-caption">{driving ? 'STEER / ACCELERATE' : 'MOVE'}</span></div>
    <div className="world-action-pads">
      {(['sprint', 'jump'] as const).map(action => <button key={action} aria-label={action === 'jump' ? 'Jump' : 'Sprint'} className="round-pad" disabled={disabled || driving}
        onContextMenu={event => event.preventDefault()}
        onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); onInput(action, true, `pad:${event.pointerId}`); }}
        onPointerUp={event => onInput(action, false, `pad:${event.pointerId}`)} onPointerCancel={event => onInput(action, false, `pad:${event.pointerId}`)}
        onLostPointerCapture={event => onInput(action, false, `pad:${event.pointerId}`)}
        onKeyDown={event => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) onInput(action, true, `button:${action}`); }}
        onKeyUp={() => onInput(action, false, `button:${action}`)} onBlur={() => onInput(action, false, `button:${action}`)}>
        <span>{action === 'jump' ? '↑' : '»'}</span><small>{action === 'jump' ? 'JUMP' : 'SPRINT'}</small>
      </button>)}
    </div>
  </div>;
}
