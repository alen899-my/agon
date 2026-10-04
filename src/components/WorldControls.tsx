import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { WiperMode, WorldAction } from '../world/Simulation';

interface Props {
  disabled: boolean;
  driving: boolean;
  speed: number;
  wiperMode: WiperMode;
  boost: number;
  boosting: boolean;
  racing: boolean;
  armed: boolean;
  aiming: boolean;
  onStick: (x: number, y: number) => void;
  onInput: (action: WorldAction, down: boolean, source: string) => void;
  onWipers: () => void;
  onReload: () => void;
  onArm?: () => void;
}

export function WorldControls({
  disabled,
  driving,
  speed,
  wiperMode,
  boost,
  boosting,
  racing,
  armed,
  aiming,
  onStick,
  onInput,
  onWipers,
  onReload,
  onArm,
}: Props) {
  const pointer = useRef<number | null>(null);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const callbacks = useRef({ onStick, onInput });
  callbacks.current = { onStick, onInput };
  const sources = useRef(new Map<string, WorldAction>());
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const driftSources = useRef(new Set<string>());

  useEffect(() => {
    const reset = () => {
      callbacks.current.onStick(0, 0);
      pointer.current = null;
      setStick({ x: 0, y: 0 });
      for (const [source, action] of sources.current) callbacks.current.onInput(action, false, source);
      sources.current.clear();
      for (const drift of driftSources.current) callbacks.current.onInput('handbrake', false, drift);
      driftSources.current.clear();
    };
    const media = matchMedia('(hover: hover) and (pointer: fine)');
    reset();
    media.addEventListener('change', reset);
    window.addEventListener('blur', reset);
    return () => {
      reset();
      media.removeEventListener('change', reset);
      window.removeEventListener('blur', reset);
    };
  }, [driving, disabled]);

  const releaseDrive = (event: PointerEvent<HTMLButtonElement>) => {
    const source = 'drive:' + event.pointerId;
    const action = sources.current.get(source);
    if (action) callbacks.current.onInput(action, false, source);
    sources.current.delete(source);
    const drift = source + ':drift';
    if (driftSources.current.has(drift)) {
      callbacks.current.onInput('handbrake', false, drift);
      driftSources.current.delete(drift);
    }
  };

  const pressDrive = (event: PointerEvent<HTMLButtonElement>, action: WorldAction) => {
    if (disabled) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const source = 'drive:' + event.pointerId;
    sources.current.set(source, action);
    callbacks.current.onInput(action, true, source);
    if (action === 'back' && Math.abs(speedRef.current) > 2) {
      const drift = source + ':drift';
      driftSources.current.add(drift);
      callbacks.current.onInput('handbrake', true, drift);
    }
  };

  useEffect(() => {
    if (Math.abs(speed) < 1 && driftSources.current.size > 0) {
      for (const drift of [...driftSources.current]) {
        callbacks.current.onInput('handbrake', false, drift);
        driftSources.current.delete(drift);
      }
    }
  }, [speed]);

  const driveButton = (action: WorldAction, arrow: string, sub: string, aria: string) => (
    <button
      key={action}
      className={`drive-pad drive-${action}`}
      disabled={disabled}
      aria-label={aria}
      onContextMenu={event => event.preventDefault()}
      onPointerDown={event => pressDrive(event, action)}
      onPointerUp={releaseDrive}
      onPointerCancel={releaseDrive}
      onLostPointerCapture={releaseDrive}
    >
      <span className="drive-arrow" aria-hidden="true">{arrow}</span>
      <small>{sub}</small>
    </button>
  );

  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== event.pointerId || disabled) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const radius = rect.width * 0.32;
    let x = (event.clientX - rect.left - rect.width / 2) / radius;
    let y = (event.clientY - rect.top - rect.height / 2) / radius;
    const length = Math.max(1, Math.hypot(x, y));
    x /= length;
    y /= length;
    setStick({ x: x * radius, y: y * radius });
    onStick(x, y);
  };

  const release = (event: PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== event.pointerId) return;
    pointer.current = null;
    setStick({ x: 0, y: 0 });
    onStick(0, 0);
  };

  /* ── Driving layout: Steering Left, Pedals & Controls Right ── */
  if (driving) {
    return (
      <div className={`world-controls driving-controls ${disabled ? 'inactive' : ''}`}>
        {/* LEFT: Steering buttons */}
        <div className="drive-steering" role="group" aria-label="Steering">
          {driveButton('left', '◀', 'LEFT', 'Steer left')}
          {driveButton('right', '▶', 'RIGHT', 'Steer right')}
        </div>

        {/* RIGHT: Pedals cluster */}
        <div className="drive-pedals" role="group" aria-label="Vehicle pedals">
          {/* Utility row: HORN, WIPER, BOOST */}
          <div className="drive-aux-row">
            {racing && (
              <div className="boost-wrap">
                <div
                  className="boost-meter"
                  role="progressbar"
                  aria-label={`Boost ${Math.round(boost)} percent`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(boost)}
                >
                  <i style={{ width: `${Math.round(boost)}%` }} className={boosting ? 'hot' : ''} />
                </div>
                <button
                  className={`drive-pad boost-pad${boosting ? ' on' : ''}`}
                  disabled={disabled || boost <= 1}
                  aria-label="Nitro boost (hold)"
                  onContextMenu={event => event.preventDefault()}
                  onPointerDown={event => pressDrive(event, 'sprint')}
                  onPointerUp={releaseDrive}
                  onPointerCancel={releaseDrive}
                  onLostPointerCapture={releaseDrive}
                >
                  <span className="drive-arrow" aria-hidden="true">⚡</span>
                  <small>{boosting ? 'BOOST!' : 'BOOST'}</small>
                </button>
              </div>
            )}
            <button
              className="drive-pad drive-aux-pad"
              disabled={disabled}
              aria-label="Honk horn"
              onContextMenu={event => event.preventDefault()}
              onPointerDown={event => {
                if (!disabled) {
                  event.preventDefault();
                  onInput('horn', true, `pad:${event.pointerId}`);
                }
              }}
              onPointerUp={event => onInput('horn', false, `pad:${event.pointerId}`)}
              onPointerCancel={event => onInput('horn', false, `pad:${event.pointerId}`)}
            >
              <span className="drive-arrow" aria-hidden="true">🔊</span>
              <small>HORN</small>
            </button>
            <button
              className={`drive-pad drive-aux-pad${wiperMode !== 'auto' ? ' on' : ''}`}
              disabled={disabled}
              aria-label={`Wipers ${wiperMode}`}
              onContextMenu={event => event.preventDefault()}
              onPointerDown={event => {
                if (!disabled) {
                  event.preventDefault();
                  onWipers();
                }
              }}
            >
              <span className="drive-arrow" aria-hidden="true">{wiperMode === 'off' ? '🚫' : '💧'}</span>
              <small>WIPER</small>
            </button>
          </div>

          {/* Primary row: BRAKE & GAS */}
          <div className="drive-main-row">
            {driveButton('back', '▼', 'BRAKE', 'Brake and reverse')}
            {driveButton('forward', '▲', 'GAS', 'Accelerate')}
          </div>
        </div>
      </div>
    );
  }

  /* ── On-foot layout: joystick left, action cluster right ── */
  return (
    <>
      {/* LEFT: Joystick anchored bottom-left */}
      <div className={`mobile-stick-zone ${disabled ? 'inactive' : ''}`}>
        <div
          className="joystick"
          aria-label="Movement joystick"
          role="group"
          onPointerDown={event => {
            if (disabled || pointer.current !== null) return;
            event.preventDefault();
            pointer.current = event.pointerId;
            event.currentTarget.setPointerCapture(event.pointerId);
            move(event);
          }}
          onPointerMove={move}
          onPointerUp={release}
          onPointerCancel={release}
          onLostPointerCapture={release}
        >
          <span className="stick-guides">＋</span>
          <span
            className="stick-knob"
            style={{ transform: `translate(${disabled ? 0 : stick.x}px, ${disabled ? 0 : stick.y}px)` }}
          />
        </div>
        <span className="control-caption">MOVE</span>
      </div>

      {/* RIGHT: Action + combat buttons anchored bottom-right */}
      <div className={`mobile-action-zone ${disabled ? 'inactive' : ''}`} role="group" aria-label="Action controls">
        {armed ? (
          <>
            {/* Top row: SPRINT, JUMP, AIM (PUBG style ADS) */}
            <div className="mobile-action-row mobile-top-row">
              <button
                aria-label="Sprint"
                className="round-pad"
                disabled={disabled}
                onContextMenu={event => event.preventDefault()}
                onPointerDown={event => {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  onInput('sprint', true, `pad:${event.pointerId}`);
                }}
                onPointerUp={event => onInput('sprint', false, `pad:${event.pointerId}`)}
                onPointerCancel={event => onInput('sprint', false, `pad:${event.pointerId}`)}
                onLostPointerCapture={event => onInput('sprint', false, `pad:${event.pointerId}`)}
              >
                <span>»</span>
                <small>SPRINT</small>
              </button>
              <button
                aria-label="Jump"
                className="round-pad"
                disabled={disabled}
                onContextMenu={event => event.preventDefault()}
                onPointerDown={event => {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  onInput('jump', true, `pad:${event.pointerId}`);
                }}
                onPointerUp={event => onInput('jump', false, `pad:${event.pointerId}`)}
                onPointerCancel={event => onInput('jump', false, `pad:${event.pointerId}`)}
                onLostPointerCapture={event => onInput('jump', false, `pad:${event.pointerId}`)}
              >
                <span>↑</span>
                <small>JUMP</small>
              </button>
              <button
                className={`round-pad aim-pad${aiming ? ' on' : ''}`}
                disabled={disabled}
                aria-label="Toggle aim / scope"
                onContextMenu={event => event.preventDefault()}
                onPointerDown={event => {
                  event.preventDefault();
                  onInput('aim', !aiming, 'aim-toggle');
                }}
              >
                <span>◎</span>
                <small>{aiming ? 'AIM ON' : 'AIM'}</small>
              </button>
            </div>

            {/* Bottom row: RELOAD and big prominent FIRE button */}
            <div className="mobile-action-row mobile-bottom-row">
              <button
                className="round-pad reload-pad"
                disabled={disabled}
                aria-label="Reload weapon"
                onContextMenu={event => event.preventDefault()}
                onPointerDown={event => {
                  event.preventDefault();
                  onReload();
                }}
              >
                <span>⟳</span>
                <small>RELOAD</small>
              </button>
              <button
                className="round-pad fire-pad"
                disabled={disabled}
                aria-label="Fire weapon"
                onContextMenu={event => event.preventDefault()}
                onPointerDown={event => {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  onInput('fire', true, `pad:${event.pointerId}`);
                }}
                onPointerUp={event => onInput('fire', false, `pad:${event.pointerId}`)}
                onPointerCancel={event => onInput('fire', false, `pad:${event.pointerId}`)}
                onLostPointerCapture={event => onInput('fire', false, `pad:${event.pointerId}`)}
              >
                <span>✸</span>
                <small>FIRE</small>
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Unarmed: SPRINT and JUMP */}
            <div className="mobile-action-row mobile-top-row">
              <button
                aria-label="Sprint"
                className="round-pad"
                disabled={disabled}
                onContextMenu={event => event.preventDefault()}
                onPointerDown={event => {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  onInput('sprint', true, `pad:${event.pointerId}`);
                }}
                onPointerUp={event => onInput('sprint', false, `pad:${event.pointerId}`)}
                onPointerCancel={event => onInput('sprint', false, `pad:${event.pointerId}`)}
                onLostPointerCapture={event => onInput('sprint', false, `pad:${event.pointerId}`)}
              >
                <span>»</span>
                <small>SPRINT</small>
              </button>
              <button
                aria-label="Jump"
                className="round-pad"
                disabled={disabled}
                onContextMenu={event => event.preventDefault()}
                onPointerDown={event => {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  onInput('jump', true, `pad:${event.pointerId}`);
                }}
                onPointerUp={event => onInput('jump', false, `pad:${event.pointerId}`)}
                onPointerCancel={event => onInput('jump', false, `pad:${event.pointerId}`)}
                onLostPointerCapture={event => onInput('jump', false, `pad:${event.pointerId}`)}
              >
                <span>↑</span>
                <small>JUMP</small>
              </button>
            </div>
            {onArm && (
              <div className="mobile-action-row mobile-bottom-row">
                <button
                  className="round-pad arm-pad"
                  disabled={disabled}
                  aria-label="Arm weapon"
                  onContextMenu={event => event.preventDefault()}
                  onPointerDown={event => {
                    event.preventDefault();
                    onArm();
                  }}
                >
                  <span>🔫</span>
                  <small>ARM</small>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
