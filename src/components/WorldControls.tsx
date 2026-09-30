import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { WorldAction } from '../world/Simulation';

interface Props { disabled: boolean; driving: boolean; onStick: (x: number, y: number) => void; onInput: (action: WorldAction, down: boolean, source: string) => void }
export function WorldControls({ disabled, driving, onStick, onInput }: Props) {
  const pointer = useRef<number | null>(null); const [stick, setStick] = useState({ x: 0, y: 0 });
  const callbacks = useRef({ onStick, onInput }); callbacks.current = { onStick, onInput };
  const sources = useRef(new Map<string, WorldAction>());
  useEffect(() => {
    const reset = () => {
      callbacks.current.onStick(0, 0); pointer.current = null; setStick({ x: 0, y: 0 });
      for (const [source, action] of sources.current) callbacks.current.onInput(action, false, source);
      sources.current.clear();
    };
    const media = matchMedia('(hover: hover) and (pointer: fine)');
    reset(); media.addEventListener('change', reset); window.addEventListener('blur', reset);
    return () => { reset(); media.removeEventListener('change', reset); window.removeEventListener('blur', reset); };
  }, [driving, disabled]);
  const releaseDrive = (event: PointerEvent<HTMLButtonElement>) => {
    const source = 'drive:' + event.pointerId, action = sources.current.get(source);
    if (action) onInput(action, false, source); sources.current.delete(source);
  };
  const driveButton = (action: WorldAction, label: string) => <button key={action} className="drive-pad" disabled={disabled} aria-label={label}
    onContextMenu={event => event.preventDefault()}
    onPointerDown={event => { if (disabled) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
      const source = 'drive:' + event.pointerId; sources.current.set(source, action); onInput(action, true, source); }}
    onPointerUp={releaseDrive} onPointerCancel={releaseDrive} onLostPointerCapture={releaseDrive}>{label}</button>;
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
    <div className="drive-steering">{driveButton('left', 'LEFT')}{driveButton('right', 'RIGHT')}</div>
    <div className="drive-pedals">{driveButton('handbrake', 'DRIFT')}{driveButton('back', 'BRAKE / REV')}{driveButton('forward', 'GAS')}</div>
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
