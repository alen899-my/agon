import type { WorldSnapshot } from '../world/Simulation';

export interface PhysicsItem { id: string; label: string; done: boolean; hint: string }
export function physicsItems(state: WorldSnapshot | null): PhysicsItem[] {
  return [
    { id: 'walk', label: 'Walk + slide along walls', done: true, hint: 'Axis-separated AABB slide' },
    { id: 'gait', label: 'Stride + idle + air poses', done: true, hint: 'Knees, elbows, bob, landing dip' },
    { id: 'jump', label: 'Jump + gravity', done: true, hint: 'vy 5.4 / g 17' },
    { id: 'drive', label: 'Car accel / brake / steer', done: true, hint: 'Grip scales with speed' },
    { id: 'front', label: 'Front obstacle probe', done: true, hint: state?.driving ? `${state.frontDistance}m ${state.frontBlocked ? 'BLOCKED' : 'clear'}` : 'Drive to scan ahead' },
    { id: 'crash', label: 'Crash bounce + damage', done: (state?.damage ?? 0) > 0 || !!state?.impact, hint: state?.impact ? `${state.impact.speed} km/h vs ${state.impact.with}` : 'Hit something fast' },
    { id: 'traffic', label: 'Traffic brake + car-vs-car', done: true, hint: 'Traffic yields, collides' },
    { id: 'parked', label: 'Parked cars solid', done: true, hint: '3 marked cars block' },
    { id: 'peds', label: 'Pedestrians flee + push', done: true, hint: 'Drive near a crowd' },
    { id: 'repair', label: 'Repair at South Station', done: (state?.damage ?? 0) === 0, hint: 'Damage caps top speed' },
    { id: 'tt-gravity', label: 'Ball gravity + air drag', done: true, hint: '9.81 m/s², drag slows long shots' },
    { id: 'tt-magnus', label: 'Magnus spin (topspin dips)', done: state?.tableFlags.topspin ?? false, hint: state?.tableFlags.topspin ? 'Topspin dipped ✓' : 'Hit TOP / swipe up' },
    { id: 'tt-smash', label: 'Smash speed', done: state?.tableFlags.smash ?? false, hint: state?.tableFlags.smash ? 'Smashed ✓' : 'Shift+hit on high ball' },
    { id: 'tt-net', label: 'Net + cord', done: state?.tableFlags.netCord ?? false, hint: state?.tableFlags.netCord ? 'Net cord seen ✓' : 'Clip the net tape' },
    { id: 'tt-edge', label: 'Table + edge bounce', done: state?.tableFlags.edge ?? false, hint: state?.tableFlags.edge ? 'Edge! ✓' : 'Aim the white line' },
    { id: 'tt-match', label: 'First to 11, win by 2', done: (state?.table?.you ?? 0) + (state?.table?.aiScore ?? 0) > 0, hint: state?.table ? `${state.table.you}–${state.table.aiScore}` : 'Enter the Game Center' },
  ];
}
export function PhysicsChecklist({ state }: { state: WorldSnapshot | null }) {
  const items = physicsItems(state);
  const done = items.filter(i => i.done).length;
  return <div className="physics-card" aria-label="Physics checklist">
    <div className="physics-head"><b>PHYSICS</b><span>{done}/{items.length} ACTIVE</span></div>
    <ul>{items.map(i => <li key={i.id} className={i.done ? 'on' : ''}><i>{i.done ? '✓' : '○'}</i><div><b>{i.label}</b><small>{i.hint}</small></div></li>)}</ul>
  </div>;
}
