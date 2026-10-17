import { useEffect, useRef, useState } from 'react';
import './WorldMap.css';
import { PLACES, type Point } from '../world/Map';
import type { Theme } from '../game/State';
import type { WorldSnapshot } from '../world/Simulation';
import type { RaceTrackId } from '../world/F1Track';
import { MapCanvas, isVisiblePlace, mapDestination, mapPlayer, type MapFilter, type MapView } from './MapCanvas';

interface MapProps { state: WorldSnapshot | null; theme?: Theme; raceActive?: boolean; raceTrack?: RaceTrackId }
const distanceLabel = (distance: number) => distance >= 1000 ? `${(distance / 1000).toFixed(2)} km` : `${Math.round(distance)} m`;

export function DistrictMap({ state, raceActive, raceTrack }: MapProps) {
  const player = mapPlayer(state), target = mapDestination(state);
  return <div className="atlas-radar">
    <MapCanvas state={state} mini headingUp raceActive={raceActive} raceTrack={raceTrack} />
    <div className="atlas-radar-status"><span>{state?.location ?? 'CITY'}</span>{target && <b>{distanceLabel(Math.hypot(target.x - player.x, target.z - player.z))}</b>}</div>
    <div className="atlas-vitals"><i style={{ width: `${Math.max(0, Math.min(100, state?.hp ?? 100))}%` }} /></div>
  </div>;
}

interface WorldMapProps extends MapProps {
  onClose: () => void; onPlace: (id: string) => void; onWaypoint: (point: Point | null) => void;
}

export function WorldMap({ state, raceActive, raceTrack, onClose, onPlace, onWaypoint }: WorldMapProps) {
  const player = mapPlayer(state);
  const [view, setView] = useState<MapView>({ ...player, scale: 2 });
  const [filter, setFilter] = useState<MapFilter>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(state?.waypoint ?? null);
  const [custom, setCustom] = useState<Point | null>(state?.mapWaypoint ?? null);
  const sheet = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const canvasArea = useRef<HTMLDivElement>(null);
  const place = PLACES.find(p => p.id === selected);
  const destination = place ?? custom;
  const active = mapDestination(state);
  const places = PLACES.filter(p => isVisiblePlace(p.category, filter) && `${p.name} ${p.category}`.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; close.current?.focus(); return () => previous?.focus(); }, []);
  const changeView = (v: MapView) => setView({ x: Math.max(-250, Math.min(1050, v.x)), z: Math.max(-300, Math.min(300, v.z)), scale: Math.max(0.35, Math.min(8, v.scale)) });
  const overview = () => {
    const bounds = canvasArea.current?.getBoundingClientRect();
    setView({ x: 382, z: 10, scale: Math.max(0.35, Math.min((bounds?.width ?? 800) / 1170, (bounds?.height ?? 500) / 440)) });
  };
  return <div className="atlas-overlay" ref={sheet} role="dialog" aria-modal="true" aria-labelledby="atlas-title" onKeyDown={event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    if (event.key === 'Tab') {
      const elements = [...(sheet.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, canvas[tabindex="0"]') ?? [])];
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <header className="atlas-header"><div><span>AGON / WORLD</span><h2 id="atlas-title">MAP</h2></div><div className="atlas-location">{state?.location ?? 'City'}<small>{state?.driving ? 'DRIVING' : 'ON FOOT'}</small></div><button ref={close} className="atlas-icon" onClick={onClose} title="Close map" aria-label="Close map">×</button></header>
    <div className="atlas-layout">
      <div className="atlas-map-area" ref={canvasArea}>
        <MapCanvas state={state} view={view} onView={changeView} filter={filter} selected={selected} preview={custom} raceActive={raceActive} raceTrack={raceTrack} onPick={(point, id) => { setSelected(id ?? null); setCustom(id ? null : point); }} />
        <div className="atlas-crosshair" aria-hidden="true">+</div>
        <div className="atlas-map-tools">
          <button className="atlas-icon" title="Zoom in" aria-label="Zoom in" onClick={() => changeView({ ...view, scale: view.scale * 1.3 })}>+</button>
          <button className="atlas-icon" title="Zoom out" aria-label="Zoom out" onClick={() => changeView({ ...view, scale: view.scale / 1.3 })}>−</button>
          <button className="atlas-icon" title="Center on player" aria-label="Center on player" onClick={() => setView({ ...player, scale: 2 })}>⌖</button>
          <button className="atlas-icon" title="Show entire map" aria-label="Show entire map" onClick={overview}>⊞</button>
        </div>
        {custom && <div className="atlas-coordinate">{Math.round(custom.x)}, {Math.round(custom.z)}</div>}
        <div className="atlas-legend"><span><i className="player" />YOU</span><span><i className="racing" />RACING</span><span><i className="destination" />WAYPOINT</span></div>
      </div>
      <aside className="atlas-sidebar" aria-label="Map locations">
        <div className="atlas-search"><input type="search" placeholder="Search locations" aria-label="Search locations" value={query} onChange={event => setQuery(event.target.value)} /><select value={filter} aria-label="Location category" onChange={event => setFilter(event.target.value as MapFilter)}><option value="all">All locations</option><option value="garages">Garages</option><option value="racing">Racing</option><option value="activities">Activities</option><option value="places">Districts & landmarks</option></select></div>
        <div className="atlas-location-list">
          {places.map(p => <button key={p.id} className={selected === p.id ? 'selected' : ''} aria-pressed={selected === p.id} onClick={() => { setSelected(p.id); setCustom(null); setView({ x: p.x, z: p.z, scale: p.id === 'f1-circuit' ? 1 : 2.5 }); }}><span className={p.category.includes('RACING') ? 'atlas-blip racing' : 'atlas-blip'}>{p.category.includes('RACING') ? '⚑' : '•'}</span><span><strong>{p.name}</strong><small>{p.category}</small></span><b>{distanceLabel(Math.hypot(p.x - player.x, p.z - player.z))}</b></button>)}
          {!places.length && <p className="atlas-empty">No locations found.</p>}
        </div>
        <div className="atlas-destination">
          <small>{destination ? 'DESTINATION' : 'WAYPOINT'}</small>
          <strong>{place?.name ?? (custom ? 'Custom waypoint' : active ? 'Waypoint active' : 'No destination selected')}</strong>
          {destination && <span>{distanceLabel(Math.hypot(destination.x - player.x, destination.z - player.z))} straight-line distance</span>}
          <button className="atlas-set" disabled={!destination} onClick={() => { if (place) onPlace(place.id); else if (custom) onWaypoint(custom); }}>Set waypoint</button>
          <button className="atlas-clear" disabled={!active} onClick={() => onWaypoint(null)}>Clear waypoint</button>
        </div>
      </aside>
    </div>
  </div>;
}
