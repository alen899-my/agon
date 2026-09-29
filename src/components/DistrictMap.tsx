import { BUILDINGS, PLACES, ROADS } from '../world/Map';
import type { WorldSnapshot } from '../world/Simulation';

export function DistrictMap({ state, large = false }: { state: WorldSnapshot | null; large?: boolean }) {
  return <svg viewBox="-125 -125 250 250" className={large ? 'district-map large-map' : 'district-map'} role="img" aria-label="Neighborhood map: buildings, streets, landmarks, and your position">
    <rect x="-125" y="-125" width="250" height="250" fill="#d1d1d1" />
    {ROADS.map(r => <g key={r} fill="#fafafa"><rect x={r - 8} y="-125" width="16" height="250" /><rect x="-125" y={r - 8} width="250" height="16" /></g>)}
    {BUILDINGS.map((b, i) => <rect key={i} x={b.x - b.w / 2} y={b.z - b.d / 2} width={b.w} height={b.d} fill="#888888" />)}
    {PLACES.map(p => <g key={p.id}>
      <circle cx={p.x} cy={p.z} r={p.id === state?.waypoint ? 5 : 3} fill={state?.discovered.includes(p.id) ? '#fff' : '#555'} stroke="#111" strokeWidth="1" />
      {large && <text x={p.x} y={p.z - 8} textAnchor="middle" fontSize="5" fontFamily="Arial" fontWeight="bold" fill="#111">{p.name.toUpperCase()}</text>}
    </g>)}
    <g transform={`translate(${state?.x ?? 12} ${state?.z ?? 34}) rotate(${(state?.yaw ?? 0) * 180 / Math.PI})`}>
      <circle r="7" fill="#ffffff" /><path d="M0-6 4 4 0 2-4 4Z" fill="#000000" />
    </g>
    <text x="110" y="-108" fontSize="10" fontFamily="Arial" fontWeight="bold" fill="#111">N</text>
  </svg>;
}
