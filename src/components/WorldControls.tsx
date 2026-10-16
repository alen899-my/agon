import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { WiperMode, WorldAction } from '../world/Simulation';
import { ControlIcon, type ControlIconName } from './ControlIcon';
interface Props {
  disabled: boolean; driving: boolean; speed: number; wiperMode: WiperMode;
  boost: number; boosting: boolean; racing: boolean; armed: boolean; aiming: boolean;
  onStick: (x: number, y: number) => void;
  onInput: (action: WorldAction, down: boolean, source: string) => void;
  onWipers: () => void; onReload: () => void; onArm?: () => void; onCamera?: () => void;
}

/** Thumb zones share one input lifecycle, including capture loss and interruptions. */
export function WorldControls(props: Props) {
  const { disabled, driving, speed, wiperMode, boost, boosting, racing, armed, aiming, onWipers, onReload, onArm, onCamera } = props;
  const callbacks = useRef(props); callbacks.current = props;
  const held = useRef(new Map<string, WorldAction>());
  const pointer = useRef<number | null>(null);
  const bounds = useRef({ x: 0, y: 0, radius: 1 });
  const [pressed, setPressed] = useState<Set<WorldAction>>(new Set());
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const refreshPressed = () => setPressed(new Set(held.current.values()));
  const releaseSource = (source: string) => {
    const action = held.current.get(source);
    if (!action) return;
    callbacks.current.onInput(action, false, source); held.current.delete(source); refreshPressed();
  };
  useEffect(() => {
    const reset = () => {
      for (const [source, action] of held.current) callbacks.current.onInput(action, false, source);
      held.current.clear(); setPressed(new Set());
      pointer.current = null; callbacks.current.onStick(0, 0); setStick({ x: 0, y: 0 });
      callbacks.current.onInput('aim', false, 'aim-toggle');
    };
    const visibility = () => { if (document.hidden) reset(); };
    reset(); window.addEventListener('blur', reset); document.addEventListener('visibilitychange', visibility);
    return () => { reset(); window.removeEventListener('blur', reset); document.removeEventListener('visibilitychange', visibility); };
  }, [disabled, driving, armed]);
  useEffect(() => {
    if (!driving || (racing && boost > 1)) return;
    for (const [source, action] of held.current) if (action === 'sprint') releaseSource(source);
  }, [driving, racing, boost]);
  const release = (event: PointerEvent<HTMLButtonElement>) => releaseSource('touch:' + event.pointerId);
  const hold = (action: WorldAction, icon: ControlIconName, label: string, extra = '', unavailable = false) => (
    <button type="button" className={'touch-button ' + extra + (pressed.has(action) ? ' is-held' : '')}
      aria-label={label + ' (hold)'} disabled={disabled || unavailable}
      onContextMenu={event => event.preventDefault()}
      onPointerDown={event => {
        if (disabled || unavailable) return;
        event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
        const source = 'touch:' + event.pointerId;
        held.current.set(source, action); callbacks.current.onInput(action, true, source); refreshPressed();
      }}
      onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
      onKeyDown={event => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
          event.preventDefault(); const source = 'touch-key:' + action;
          held.current.set(source, action); callbacks.current.onInput(action, true, source); refreshPressed();
        }
      }}
      onKeyUp={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); releaseSource('touch-key:' + action); } }}
      onBlur={() => releaseSource('touch-key:' + action)}>
      <ControlIcon name={icon} /><span>{label}</span>
    </button>
  );
  const tap = (icon: ControlIconName, label: string, onClick: () => void, selected = false, extra = '') => (
    <button type="button" className={'touch-button ' + extra + (selected ? ' is-selected' : '')} disabled={disabled}
      aria-label={label} aria-pressed={icon === 'aim' || icon === 'wiper' ? selected : undefined}
      onContextMenu={event => event.preventDefault()} onClick={onClick}>
      <ControlIcon name={icon} /><span>{label}</span>
    </button>
  );
  const moveStick = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || pointer.current !== event.pointerId) return;
    const b = bounds.current;
    const dx = (event.clientX - b.x) / b.radius, dy = (event.clientY - b.y) / b.radius;
    const length = Math.hypot(dx, dy), clamp = Math.max(1, length);
    setStick({ x: dx / clamp * b.radius, y: dy / clamp * b.radius });
    const strength = length <= 0.12 ? 0 : Math.min(1, (length - 0.12) / 0.88);
    callbacks.current.onStick(length ? dx / length * strength : 0, length ? dy / length * strength : 0);
  };
  const releaseStick = (event: PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null; setStick({ x: 0, y: 0 }); callbacks.current.onStick(0, 0);
  };
  return <div className={'phone-controls ' + (driving ? 'phone-driving' : armed ? 'phone-combat' : 'phone-walking') + (disabled ? ' inactive' : '')}
    aria-label={driving ? 'Touch driving controls' : 'Touch character controls'}>
    <div className="phone-left-zone">
      {driving ? <div className="phone-steering" role="group" aria-label="Steering">
        {hold('left', 'left', 'Left', 'touch-steer')}{hold('right', 'right', 'Right', 'touch-steer')}
      </div> : <>
        {hold('sprint', 'sprint', 'Sprint', 'touch-sprint')}
        <div className="phone-joystick" role="group" aria-label="Drag to move" onContextMenu={event => event.preventDefault()}
          onPointerDown={event => {
            if (disabled || pointer.current !== null) return;
            event.preventDefault(); pointer.current = event.pointerId;
            const rect = event.currentTarget.getBoundingClientRect();
            bounds.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, radius: rect.width * 0.3 };
            event.currentTarget.setPointerCapture(event.pointerId); moveStick(event);
          }} onPointerMove={moveStick} onPointerUp={releaseStick} onPointerCancel={releaseStick} onLostPointerCapture={releaseStick}>
          <i className="phone-stick-ring" /><i className="phone-stick-knob" style={{ transform: 'translate(' + stick.x + 'px, ' + stick.y + 'px)' }} />
        </div>
      </>}
    </div>
    {driving ? <>
      <div className="phone-vehicle-tools" role="group" aria-label="Vehicle utilities">
        {hold('horn', 'horn', 'Horn', 'touch-utility')}
        {tap('wiper', 'Wipers', onWipers, wiperMode === 'on', 'touch-utility')}
        {onCamera && tap('camera', 'View', onCamera, false, 'touch-utility')}
      </div>
      <div className="phone-right-zone">
        <div className="phone-driving-actions">
          {hold('handbrake', 'drift', 'Drift', 'touch-drift')}
          {racing && <div className={'phone-boost' + (boosting ? ' boosting' : '')}>
            {hold('sprint', 'boost', 'Boost', 'touch-boost', boost <= 1)}
            <div className="phone-boost-track" role="progressbar" aria-label="Boost available" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(boost)}><i style={{ width: Math.max(0, Math.min(100, boost)) + '%' }} /></div>
          </div>}
        </div>
        <div className="phone-pedals" role="group" aria-label="Pedals">
          {hold('back', 'brake', speed < -0.5 ? 'Reverse' : 'Brake', 'touch-brake')}
          {hold('forward', 'gas', 'Gas', 'touch-gas')}
        </div>
      </div>
    </> : <div className="phone-right-zone phone-actions" role="group" aria-label="Character actions">
      {armed && tap('aim', aiming ? 'Aim on' : 'Aim', () => callbacks.current.onInput('aim', !aiming, 'aim-toggle'), aiming, 'touch-aim')}
      {hold('jump', 'jump', 'Jump', 'touch-jump')}
      {armed ? <>
        {tap('reload', 'Reload', onReload, false, 'touch-reload')}
        {hold('fire', 'fire', 'Fire', 'touch-fire')}
      </> : onArm && tap('weapon', 'Equip', onArm, false, 'touch-equip')}
    </div>}
  </div>;
}
