interface Props {
  disabled: boolean;
  pumping: boolean;
  onTap: () => void;
}

/** Tap-tap meter: first tap pumps the power up/down, second tap throws. */
export function BasketballControls({ disabled, pumping, onTap }: Props) {
  return <div className={`tt-controls ${disabled ? 'inactive' : ''}`}>
    <span className="control-caption tt-auto">TAP TO PUMP ● TAP TO THROW</span>
    <div className="world-action-pads tt-pads">
      <button aria-label="Tap to pump meter, tap again to shoot" className={`round-pad bb-shoot${pumping ? ' hot' : ''}`}
        disabled={disabled}
        onContextMenu={event => event.preventDefault()}
        onPointerDown={event => { event.preventDefault(); onTap(); }}>
        <span>🏀</span><small>{pumping ? 'THROW!' : 'TAP'}</small>
      </button>
    </div>
  </div>;
}
