import type { TTShot, TTSnapshot } from '../world/TableTennis';
interface Props { disabled:boolean; snapshot:TTSnapshot|null; onSwing:(shot:TTShot)=>void; onAim:(aim:number)=>void }
export function TableTennisControls({disabled,snapshot:t,onSwing,onAim}:Props) {
  return <div className={`tt-controls table-deck ${disabled?'inactive':''}`}>
    <div className="sports-placement" role="group" aria-label="Return placement">{[-1,0,1].map((aim,i)=><button key={aim} disabled={disabled} aria-pressed={t?.aim===aim} onClick={()=>onAim(aim)}>{['↖ Left corner','↑ Center','↗ Right corner'][i]}</button>)}</div>
    <span className="control-caption tt-auto">{t?.contact || 'WATCH THE BOUNCE · PICK YOUR RETURN'}</span>
    <div className="world-action-pads tt-pads">{([['drive','DRIVE','Safe return'],['topspin','TOPSPIN','Dip & pace'],['chop','SLICE','Slow & low'],['smash','SMASH','Attack high balls']] as [TTShot,string,string][]).map(([shot,label,hint])=><button key={shot} disabled={disabled||t?.matchOver} className={`round-pad tt-pad ${shot==='smash'?'smash':''}`} aria-label={`${label}: ${hint}`} onClick={()=>onSwing(shot)}><b>{label}</b><small>{hint}</small></button>)}</div>
  </div>;
}
