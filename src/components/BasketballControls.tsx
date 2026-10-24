import type { BBSnapshot, BBStyle } from '../world/Basketball';
interface Props {
  disabled: boolean;
  snapshot: BBSnapshot | null;
  online: boolean;
  onTap: () => void;
  onConfigure: (style:BBStyle,aim:number) => void;
  onChallenge: () => void;
}
export function BasketballControls({disabled,snapshot:b,online,onTap,onConfigure,onChallenge}:Props) {
  if(!b) return null;
  const locked=disabled || b.phase!=='hold' || b.pumping;
  return <div className={`tt-controls basketball-deck ${disabled?'inactive':''}`}>
    <div className="sports-shot-options" role="group" aria-label="Shot arc">
      {(['jump','arc','quick'] as const).map((style,i)=><button key={style} disabled={locked} aria-pressed={b.style===style} onClick={()=>onConfigure(style,b.aim)}><b>{['Jump shot','High arc','Quick release'][i]}</b><small>{['Balanced · 53°','Soft landing · 62°','Flatter · 45°'][i]}</small></button>)}
    </div>
    <label className="sports-aim">AIM <span>LEFT</span><input aria-label="Basketball lateral aim" type="range" min={-1} max={1} step={0.1} value={b.aim} disabled={locked} onChange={e=>onConfigure(b.style,Number(e.target.value))}/><span>RIGHT</span><button disabled={locked} onClick={()=>onConfigure(b.style,0)}>Center</button></label>
    <div className="sports-actions"><button className={`sports-release ${b.pumping?'charging':''}`} disabled={disabled||b.phase!=='hold'} onClick={onTap}><strong>{b.phase==='flight'?'SHOT IN FLIGHT':b.phase==='done'?'RESULT':b.pumping?'RELEASE SHOT':'START SHOT'}</strong><small>{b.pumping?'Tap in the green zone':'Tap / Space · tap again to release'}</small></button>{!online && <button className="sports-contest" disabled={b.phase==='flight'||b.pumping} onClick={onChallenge}>{b.challengeOver?'Play again':'10-shot contest'}<small>Five racks · 22 points possible</small></button>}</div>
    <p className="sports-tip">{disabled?'Opponent playing — your turn is next.':b.challengeOver?'Contest complete. Play again to beat your score.':'Choose your arc, center your aim, then time the green release.'}</p>
  </div>;
}
export function BasketballHud({snapshot:b}:{snapshot:BBSnapshot}) {
  const accuracy=b.attempts?Math.round(b.makes/b.attempts*100):0;
  return <section className="basketball-hud" aria-label="Basketball shot dashboard">
    <div className="sports-scoreline"><span><small>POINTS</small><b>{b.points.toString().padStart(2,'0')}</b></span><div><strong>{b.spotLabel}</strong><small>{b.shotValue}-POINT SHOT · {accuracy}% FG · STREAK {b.streak}</small></div><span><small>MAKES</small><b>{b.makes}<em>/{b.attempts}</em></b></span></div>
    <div className={`sports-timing ${b.release==='PERFECT RELEASE'?'perfect':''}`} role="meter" aria-label="Shot power" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(b.power*100)}><div style={{width:`${b.power*100}%`}}/><i style={{left:`${b.greenLo*100}%`,width:`${(b.greenHi-b.greenLo)*100}%`}}/><b style={{left:`${b.power*100}%`}}/></div>
    <div className="sports-meter-label"><span>EARLY</span><strong>{b.release || (b.pumping?'RELEASE IN GREEN':'FIND YOUR RHYTHM')}</strong><span>LATE</span></div>
  </section>;
}
