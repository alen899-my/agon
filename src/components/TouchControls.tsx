import { useRef, useState, type PointerEvent } from 'react';
import type { Action } from '../game/State';

interface Props { disabled: boolean; onInput: (action: Action, down: boolean, source: string) => void }
function Pad({ action, label, hint, disabled, onInput }: Props & { action: Action; label: string; hint: string }) {
  const pointers = useRef(new Set<number>());
  const [held, setHeld] = useState(false);
  const release = (event: PointerEvent<HTMLButtonElement>) => {
    pointers.current.delete(event.pointerId);
    onInput(action, false, `touch:${event.pointerId}`);
    setHeld(pointers.current.size > 0);
  };
  return <button className={`pad pad-${action} ${held && !disabled ? 'held' : ''}`} disabled={disabled}
    aria-label={label} onContextMenu={event => event.preventDefault()}
    onPointerDown={event => {
      if (event.button !== 0) return;
      event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
      pointers.current.add(event.pointerId); setHeld(true);
      onInput(action, true, `touch:${event.pointerId}`);
    }} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}
    onKeyDown={event => {
      if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); if (!event.repeat) onInput(action, true, `pad:${action}`); }
    }} onKeyUp={event => {
      if (event.code === 'Space' || event.code === 'Enter') { event.preventDefault(); onInput(action, false, `pad:${action}`); }
    }} onBlur={() => onInput(action, false, `pad:${action}`)}>
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {action === 'left' ? <path d="M20 7 11 16 20 25M11 16h15" /> :
        action === 'right' ? <path d="m12 7 9 9-9 9M21 16H6" /> :
        action === 'jump' ? <path d="M16 26V6m-8 8 8-8 8 8M6 27h20" /> :
        <><path d="M8 25 5 15l4-3 2 4V7h5v7-9h5v9-7h5v13l-5 7H11Z" /></>}
    </svg>
    <span>{label}</span><kbd>{hint}</kbd>
  </button>;
}
export function TouchControls(props: Props) {
  return <div className="touch-controls" aria-label="Movement controls">
    <div className="direction-pads"><Pad {...props} action="left" label="Left" hint="A" /><Pad {...props} action="right" label="Right" hint="D" /></div>
    <p className="controller-note">KEEP GOING.<br /><span>YOU'RE GETTING STRONGER.</span></p>
    <div className="action-pads"><Pad {...props} action="punch" label="Punch" hint="J" /><Pad {...props} action="jump" label="Jump" hint="SPACE" /></div>
  </div>;
}
