import { GUNS } from '../world/Guns';
import { GunIcon } from './GunIcon';

interface Props {
  armed: boolean;
  gunIndex: number;
  mag: number;
  reloading: boolean;
  reloadT: number;
  reloadDur: number;
  disabled: boolean;
  onPrev: () => void;
  onNext: () => void;
  onArm: () => void;
  onDisarm: () => void;
}

/**
 * PUBG-style weapon dock: current gun image + name + ammo in the middle,
 * arrows on both sides to switch, ✕ to holster. Always visible on foot —
 * tapping it arms the pistol when unarmed, so the gun is discoverable
 * on PC and touch alike without knowing any key.
 */
export function WeaponDock({ armed, gunIndex, mag, reloading, reloadT, reloadDur, disabled, onPrev, onNext, onArm, onDisarm }: Props) {
  const gun = GUNS[gunIndex % GUNS.length];
  return (
    <div className="weapon-dock" role="group" aria-label="Weapon selector">
      <button className="dock-arrow" disabled={disabled} onClick={armed ? onPrev : onArm} aria-label="Previous weapon">◀</button>
      <button className={`dock-main${armed ? ' on' : ''}`} disabled={disabled} onClick={onArm} aria-label={armed ? `${gun.name}, ${mag} rounds. Tap to cycle.` : 'Arm weapon'}>
        {armed ? (
          <>
            <GunIcon cls={gun.cls} gunKey={gun.key} />
            <b>{gun.name}</b>
            <span className="dock-ammo">{mag}<small>/{GUNS[gunIndex % GUNS.length].mag} ∞</small></span>
          </>
        ) : (
          <>
            <span className="dock-fist" aria-hidden="true">🔫</span>
            <b>NO WEAPON</b>
            <span className="dock-ammo dim">TAP TO ARM</span>
          </>
        )}
        {armed && reloading && (
          <div className="dock-reload" aria-hidden="true">
            <i style={{ width: `${reloadDur > 0 ? Math.round(100 * (1 - reloadT / reloadDur)) : 100}%` }} />
          </div>
        )}
      </button>
      <button className="dock-arrow" disabled={disabled} onClick={armed ? onNext : onArm} aria-label="Next weapon">▶</button>
      {armed && <button className="dock-x" disabled={disabled} onClick={onDisarm} aria-label="Holster weapon">✕</button>}
    </div>
  );
}
