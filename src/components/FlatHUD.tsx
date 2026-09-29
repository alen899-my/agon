import type { Snapshot } from '../game/State';
export function FlatHUD({ state }: { state: Snapshot | null }) {
  return <div className="game-hud">
    <div className="level-badge"><span className="eyebrow">LEVEL</span><strong>{String(state?.level ?? 1).padStart(2, '0')}</strong>
      <div><b>{state?.title ?? 'THE FIRST REP'}</b><span>{state?.checkpoint ? 'Checkpoint secured' : 'Reach the exit. Earn your growth.'}</span></div>
    </div>
    <div className="hud-stats">
      <div className="health" aria-label={`${state?.health ?? 3} of 3 health`}>
        {[0, 1, 2].map(i => <span key={i} className={i < (state?.health ?? 3) ? 'filled' : ''}>♥</span>)}
      </div>
      <div className="strength"><b>{state?.physique ?? 'ROOKIE'}</b><span>STR {state?.strength ?? 1} <i> / </i> ◆ {state?.gains ?? 0}</span></div>
    </div>
    <div className="course-progress" role="progressbar" aria-label="Course progress" aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={Math.round((state?.progress ?? 0) * 100)}><div style={{ width: `${(state?.progress ?? 0) * 100}%` }} /></div>
  </div>;
}
