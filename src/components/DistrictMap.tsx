import { BUILDINGS, PLACES, ROADS } from '../world/Map';
import { startLine, TRACK_POINTS } from '../world/Track';
import type { Theme } from '../game/State';
import type { WorldSnapshot } from '../world/Simulation';

const BUILDING_COLORS = ['#e0b47c', '#c46a4a', '#7d94ad'];
const TRACK_D = TRACK_POINTS.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.z}`).join(' ') + ' Z';
const START = startLine();
const ROUTE_ARROWS = TRACK_POINTS.map((p, i) => {
  const q = TRACK_POINTS[(i + 1) % TRACK_POINTS.length];
  return { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2, yaw: Math.atan2(q.x - p.x, p.z - q.z) * 180 / Math.PI };
});
export function DistrictMap({ state, large = false, theme = 'light', raceActive = false }: { state: WorldSnapshot | null; large?: boolean; theme?: Theme; raceActive?: boolean }) {
  const color = theme === 'color';
  return <svg viewBox="-175 -175 350 350" className={large ? 'district-map large-map' : 'district-map'} role="img" aria-label="Neighborhood map: buildings, streets, landmarks, race track and your position">
    <rect x="-175" y="-175" width="350" height="350" fill={color ? '#a9c795' : '#d1d1d1'} />
    {ROADS.map(r => <g key={r} fill={color ? '#43484f' : '#fafafa'}><rect x={r - 8} y="-175" width="16" height="350" /><rect x="-175" y={r - 8} width="350" height="16" /></g>)}
    {BUILDINGS.map((b, i) => <rect key={i} x={b.x - b.w / 2} y={b.z - b.d / 2} width={b.w} height={b.d} fill={color ? BUILDING_COLORS[b.shade % 3] : '#888888'} />)}
    {color && <rect x="25" y="-64" width="32" height="31" fill="#5da75d" />}
    {raceActive && <g aria-label="Active race route">
      <path d={TRACK_D} fill="none" stroke="#ffdc38" strokeWidth="9" opacity="0.2" strokeLinejoin="round" />
      <path d={TRACK_D} fill="none" stroke="#141a22" strokeWidth="5.5" strokeLinejoin="round" />
      <path d={TRACK_D} fill="none" stroke="#ffdc38" strokeWidth="3" strokeLinejoin="round" />
      {ROUTE_ARROWS.map((p, i) => <path key={i} d="M -3 2 L 0 -2 L 3 2" fill="none" stroke="#141a22" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" transform={`translate(${p.x} ${p.z}) rotate(${p.yaw})`} />)}
      <g transform={`translate(${START.x} ${START.z})`}>
        <rect x="-4" y="-4" width="8" height="8" fill="#fff" stroke="#141a22" strokeWidth="1" />
        <path d="M -4 -4 H 0 V 0 H -4 Z M 0 0 H 4 V 4 H 0 Z" fill="#141a22" />
        {large && <text y="-8" textAnchor="middle" fontSize="4" fontFamily="Arial" fontWeight="bold" fill="#141a22">START / FINISH</text>}
      </g>
    </g>}
    {PLACES.map(p => <g key={p.id}>
      <circle cx={p.x} cy={p.z} r={!raceActive && p.id === state?.waypoint ? 5 : 3} fill={color ? (state?.discovered.includes(p.id) ? '#2e7d32' : '#ffffff') : (state?.discovered.includes(p.id) ? '#fff' : '#555')} stroke={color ? '#1b4d1b' : '#111'} strokeWidth="1" />
      {large && <text x={p.x} y={p.z - 8} textAnchor="middle" fontSize="5" fontFamily="Arial" fontWeight="bold" fill="#111">{p.name.toUpperCase()}</text>}
    </g>)}
    <g transform={`translate(${state?.x ?? 12} ${state?.z ?? 34}) rotate(${(state?.yaw ?? 0) * 180 / Math.PI})`}>
      <circle r="7" fill="#ffffff" /><path d="M0-6 4 4 0 2-4 4Z" fill="#000000" />
    </g>
    {(state?.dots ?? []).map(d => <circle key={d.id} cx={d.x} cy={d.z} r={2.4}
      fill={d.driving ? '#111111' : '#ffffff'} stroke="#111111" strokeWidth="0.8" />)}
    <text x="158" y="-158" fontSize="10" fontFamily="Arial" fontWeight="bold" fill="#111">N</text>
  </svg>;
}
