import { useEffect, useRef, useState } from 'react';
import { BRIDGE, BUILDINGS, CANAL, PLACES, ROADS, type Point } from '../world/Map';
import { F1_ACCESS_SAMPLES } from '../world/F1Access';
import { F1_LENGTH, F1_ORIGIN, f1PathAt, type RaceTrackId } from '../world/F1Track';
import { TRACK_POINTS } from '../world/Track';
import { GARAGE } from '../world/GarageLocation';
import type { WorldSnapshot } from '../world/Simulation';

export type MapFilter = 'all' | 'racing' | 'activities' | 'places' | 'garages';
export type MapView = { x: number; z: number; scale: number };
export const CIRCUIT_POINTS = Array.from({ length: 241 }, (_, i) => f1PathAt(i / 240 * F1_LENGTH));
export const isVisiblePlace = (category: string, filter: MapFilter) => filter === 'all' ||
  (filter === 'garages' ? category === 'GARAGE' : filter === 'racing' ? category.includes('RACING') : filter === 'activities' ? category.includes('SPORTS') || category === 'PARK' : !category.includes('RACING') && !category.includes('SPORTS'));
export function mapDestination(state: WorldSnapshot | null): Point | null {
  return state?.mapWaypoint ?? PLACES.find(p => p.id === state?.waypoint) ?? null;
}
export function mapPlayer(state: WorldSnapshot | null): Point {
  return state?.driving ? state.car : { x: state?.x ?? 12, z: state?.z ?? 34 };
}

interface Props {
  state: WorldSnapshot | null; mini?: boolean; view?: MapView; headingUp?: boolean;
  filter?: MapFilter; selected?: string | null; preview?: Point | null; raceActive?: boolean; raceTrack?: RaceTrackId;
  onView?: (view: MapView) => void; onPick?: (point: Point, id?: string) => void;
}

/** One world-space canvas for the pause map and heading-up radar. */
export function MapCanvas({ state, mini = false, view = { x: 360, z: 0, scale: 0.8 }, headingUp = false, filter = 'all', selected, preview, raceActive, raceTrack, onView, onPick }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ x: 0, y: 0, moved: false });
  const player = mapPlayer(state);
  const yaw = state?.driving ? state.car.yaw : state?.yaw ?? 0;
  const rotation = mini && headingUp ? -yaw : 0;
  const scale = mini ? Math.min(size.width, size.height) / (state?.driving ? 140 + Math.min(80, Math.abs(state.car.speed)) : 110) : view.scale;
  const center = mini ? player : view;
  const latest = useRef({ view, onView, onPick, size });
  latest.current = { view, onView, onPick, size };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const observer = new ResizeObserver(entries => {
      const rect = entries[0].contentRect;
      setSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) });
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (mini || !ref.current) return;
    const canvas = ref.current;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const { view: v, onView: update, size: s } = latest.current;
      const bounds = canvas.getBoundingClientRect();
      const x = event.clientX - bounds.left - s.width / 2, y = event.clientY - bounds.top - s.height / 2;
      const next = Math.max(0.35, Math.min(8, v.scale * Math.exp(-event.deltaY * 0.0015)));
      update?.({ x: v.x + x / v.scale - x / next, z: v.z + y / v.scale - y / next, scale: next });
    };
    canvas.addEventListener('wheel', wheel, { passive: false });
    return () => canvas.removeEventListener('wheel', wheel);
  }, [mini]);

  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size.width * dpr); canvas.height = Math.round(size.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#171b1d'; ctx.fillRect(0, 0, size.width, size.height);
    const project = (p: Point) => {
      const dx = p.x - center.x, dz = p.z - center.z;
      return { x: size.width / 2 + (dx * Math.cos(rotation) - dz * Math.sin(rotation)) * scale, y: size.height / 2 + (dx * Math.sin(rotation) + dz * Math.cos(rotation)) * scale };
    };
    const line = (points: readonly Point[], color: string, width: number, dash: number[] = []) => {
      ctx.beginPath(); points.forEach((p, i) => { const s = project(p); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
    };
    const rect = (x: number, z: number, w: number, h: number, color: string) => {
      ctx.beginPath(); [{ x, z }, { x: x + w, z }, { x: x + w, z: z + h }, { x, z: z + h }].forEach((p, i) => { const s = project(p); if (!i) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
      ctx.closePath(); ctx.fillStyle = color; ctx.fill();
    };
    rect(-165, -165, 330, 330, '#252a2c');
    rect(F1_ORIGIN.x - 290, -145, 580, 330, '#222b27');
    if (!mini) for (let x = -200; x <= 1000; x += 50) line([{ x, z: -250 }, { x, z: 250 }], '#293033', 0.5);
    if (!mini) for (let z = -250; z <= 250; z += 50) line([{ x: -200, z }, { x: 1000, z }], '#293033', 0.5);
    BUILDINGS.forEach(b => rect(b.x - b.w / 2, b.z - b.d / 2, b.w, b.d, '#383e40'));
    rect(GARAGE.x - GARAGE.w / 2, GARAGE.z - GARAGE.d / 2, GARAGE.w, GARAGE.d, '#36675b');
    (state?.buildSites ?? []).forEach(b => rect(b.x - b.w / 2, b.z - b.d / 2, b.w, b.d, b.stage === 4 ? '#4b5355' : '#796347'));
    const roads: Point[][] = ROADS.flatMap(r => [[{ x: -160, z: r }, { x: 160, z: r }], [{ x: r, z: -160 }, { x: r, z: 160 }]]);
    roads.push(F1_ACCESS_SAMPLES, CIRCUIT_POINTS);
    roads.forEach(points => line(points, '#111516', Math.max(3, 19 * scale)));
    roads.forEach(points => line(points, '#a9aeae', Math.max(1.5, 13 * scale)));
    rect(CANAL.x0, CANAL.z0, CANAL.x1 - CANAL.x0, CANAL.z1 - CANAL.z0, '#21383f');
    rect(-BRIDGE.halfW, BRIDGE.zSGrade, BRIDGE.halfW * 2, BRIDGE.zNGrade - BRIDGE.zSGrade, '#a9aeae');
    if (raceActive) line(raceTrack === 'f1' ? CIRCUIT_POINTS : [...TRACK_POINTS, TRACK_POINTS[0]], '#f3c949', 3);
    const destination = mapDestination(state);
    if (destination) {
      line([player, destination], '#cf85ed', 2, [5, 5]);
      const p = project(destination);
      const x = Math.max(12, Math.min(size.width - 12, p.x)), y = Math.max(12, Math.min(size.height - 12, p.y));
      ctx.strokeStyle = '#df99ff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#df99ff'; ctx.fillRect(x - 3, y - 3, 6, 6);
    }
    PLACES.filter(p => isVisiblePlace(p.category, filter)).forEach(p => {
      const s = project(p); if (s.x < -15 || s.x > size.width + 15 || s.y < -15 || s.y > size.height + 15) return;
      const racing = p.category.includes('RACING');
      const garage = p.category === 'GARAGE';
      ctx.fillStyle = selected === p.id ? '#df99ff' : garage ? '#a5ffe2' : racing ? '#f3c949' : '#fafafa';
      ctx.strokeStyle = '#141819'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, garage ? (mini ? 7 : 10) : mini ? 4 : 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (garage) {
        ctx.fillStyle = '#12382d'; ctx.font = `bold ${mini ? 9 : 12}px Arial`; ctx.textAlign = 'center';
        ctx.fillText('G', s.x, s.y + (mini ? 3 : 4));
      }
      if (!mini && (garage || selected === p.id || scale > 2)) {
        ctx.font = '600 12px Arial'; ctx.textAlign = 'left'; ctx.lineWidth = 4; ctx.strokeStyle = '#171b1d';
        ctx.strokeText(p.name, s.x + 12, s.y + 4); ctx.fillStyle = '#fff'; ctx.fillText(p.name, s.x + 12, s.y + 4);
      }
    });
    (state?.dots ?? []).forEach(d => { const s = project(d); ctx.fillStyle = '#66cbd5'; ctx.fillRect(s.x - 3, s.y - 3, 6, 6); });
    if (preview && !mini) {
      const p = project(preview); ctx.strokeStyle = '#df99ff'; ctx.lineWidth = 2;
      ctx.strokeRect(p.x - 10, p.y - 10, 20, 20);
    }
    const p = project(player);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(yaw + rotation); ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#101415'; ctx.lineWidth = 2; ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.font = 'bold 11px Arial'; ctx.textAlign = 'left'; ctx.fillStyle = '#c3ccce';
    if (mini && headingUp) {
      const radius = Math.min(size.width, size.height) / 2 - 14;
      ctx.textAlign = 'center'; ctx.fillText('N', size.width / 2 - Math.sin(yaw) * radius, size.height / 2 - Math.cos(yaw) * radius + 4);
    } else ctx.fillText('N', 12, 20);
    if (!mini) {
      const metres = scale > 3 ? 20 : scale > 1 ? 50 : 100;
      ctx.fillRect(20, size.height - 22, metres * scale, 2); ctx.font = '11px Arial'; ctx.fillText(`${metres} m`, 20, size.height - 30);
    }
  }, [state, size, view, mini, headingUp, filter, selected, preview, raceActive, raceTrack, center.x, center.z, scale, rotation, player.x, player.z, yaw]);

  const pick = (clientX: number, clientY: number) => {
    const bounds = ref.current!.getBoundingClientRect();
    const point = { x: view.x + (clientX - bounds.left - size.width / 2) / scale, z: view.z + (clientY - bounds.top - size.height / 2) / scale };
    const nearest = PLACES.filter(p => isVisiblePlace(p.category, filter)).sort((a, b) => Math.hypot(a.x - point.x, a.z - point.z) - Math.hypot(b.x - point.x, b.z - point.z))[0];
    if (nearest && Math.hypot(nearest.x - point.x, nearest.z - point.z) * scale < 18) onPick?.(nearest, nearest.id);
    else onPick?.({ x: Math.max(-160, Math.min(F1_ORIGIN.x + 300, point.x)), z: Math.max(-180, Math.min(180, point.z)) });
  };
  return <canvas ref={ref} className="atlas-canvas" aria-label={mini ? 'Live radar' : 'Interactive city and circuit map'} tabIndex={mini ? -1 : 0}
    onPointerDown={event => { if (mini) return; event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY }); gesture.current = { x: event.clientX, y: event.clientY, moved: pointers.current.size > 1 }; }}
    onPointerMove={event => {
      const previous = pointers.current.get(event.pointerId); if (!previous || mini) return;
      const current = { x: event.clientX, y: event.clientY };
      const other = [...pointers.current.entries()].find(([id]) => id !== event.pointerId)?.[1];
      if (other) {
        const ratio = Math.hypot(current.x - other.x, current.y - other.y) / Math.max(1, Math.hypot(previous.x - other.x, previous.y - other.y));
        onView?.({ ...view, scale: Math.max(0.35, Math.min(8, view.scale * ratio)) }); gesture.current.moved = true;
      } else {
        if (Math.hypot(current.x - gesture.current.x, current.y - gesture.current.y) > 5) gesture.current.moved = true;
        onView?.({ ...view, x: view.x - (current.x - previous.x) / scale, z: view.z - (current.y - previous.y) / scale });
      }
      pointers.current.set(event.pointerId, current);
    }}
    onPointerUp={event => { if (mini) return; if (pointers.current.has(event.pointerId) && !gesture.current.moved) pick(event.clientX, event.clientY); pointers.current.delete(event.pointerId); }}
    onPointerCancel={event => { pointers.current.delete(event.pointerId); gesture.current.moved = true; }}
    onKeyDown={event => {
      if (mini) return;
      const moves: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (moves[event.key]) { event.preventDefault(); const [x, z] = moves[event.key]; onView?.({ ...view, x: view.x + x * 50 / scale, z: view.z + z * 50 / scale }); }
      if (event.key === '+' || event.key === '-' || event.key === '=') { event.preventDefault(); onView?.({ ...view, scale: Math.max(0.35, Math.min(8, scale * (event.key === '-' ? 0.8 : 1.25))) }); }
      if (event.key === 'Enter') { event.preventDefault(); onPick?.({ x: view.x, z: view.z }); }
    }} />;
}
