import type { TTShot } from '../world/TableTennis';

interface Props {
  disabled: boolean;
  onSwing: (shot: TTShot) => void;
}

/** Shot-only controls: the paddle positions itself, you pick the shot. */
export function TableTennisControls({ disabled, onSwing }: Props) {
  return <div className={`tt-controls ${disabled ? 'inactive' : ''}`}>
    <span className="control-caption tt-auto">AUTO MOVE ● PICK YOUR SHOT</span>
    <div className="world-action-pads tt-pads">
      {([['drive', 'HIT'], ['topspin', 'TOP'], ['chop', 'CHOP'], ['smash', 'SMASH']] as [TTShot, string][]).map(([shot, label]) => (
        <button key={shot} aria-label={`${label} shot`} className={`round-pad tt-pad${shot === 'smash' ? ' smash' : ''}`}
          disabled={disabled}
          onContextMenu={event => event.preventDefault()}
          onPointerDown={event => { event.preventDefault(); onSwing(shot); }}>
          <span>{shot === 'drive' ? '🏓' : shot === 'topspin' ? '↗' : shot === 'chop' ? '↘' : '⚡'}</span>
          <small>{label}</small>
        </button>
      ))}
    </div>
  </div>;
}
