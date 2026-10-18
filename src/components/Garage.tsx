import { useEffect, useRef, useState } from 'react';
import { GaragePreview } from './GaragePreview';
import { useGaragePartPreviews } from './GaragePartPreviews';
import type { WorldEngine } from '../world/WorldEngine';
import { VEHICLES, type VehicleKind } from '../world/Vehicles';
import { PART_OPTIONS, stockBuild, tuning, partLabel, partProfile, type PartKey, type VehicleCustomization } from '../world/VehicleCustomization';
import { loadSession } from '../api/session';
import { persistBuild } from '../api/garage';
import { VehicleAudio } from '../game/VehicleAudio';
import { garageSound, garagePitch } from '../game/GarageSound';
import './Garage.css';

const CATEGORIES = ['Paint', 'Wheels', 'Performance', 'Bodywork', 'Lighting', 'Sound', 'My builds'] as const;
type Category = typeof CATEGORIES[number];
const PARTS: Record<Category, PartKey[]> = {
  Paint: ['finish'], Wheels: ['tyres', 'rims'], Performance: ['engine', 'transmission', 'brakes', 'suspension'],
  Bodywork: ['hood', 'roof', 'frontBumper', 'rearBumper', 'skirts', 'spoiler', 'exhaust'], Lighting: ['tint', 'lights', 'underglow'], Sound: ['sound'], 'My builds': [],
};
const LABELS: Record<string, string> = { tyres: 'Tires', rims: 'Rims', engine: 'Engine', transmission: 'Transmission', brakes: 'Brakes', suspension: 'Suspension', hood: 'Hood', roof: 'Roof', frontBumper: 'Front bumper', rearBumper: 'Rear bumper', skirts: 'Side skirts', spoiler: 'Spoiler', exhaust: 'Exhaust', tint: 'Window tint', lights: 'Headlights', underglow: 'Underglow', sound: 'Engine voice', finish: 'Paint finish', fiveSpoke: 'Forged five-spoke', mesh: 'Multi-spoke', disc: 'Aero disc', steel: 'Steel classic', stock: 'Factory', offroad: 'All-terrain', slick: 'Track slicks', drift: 'Drift compound', street: 'Performance street', ceramic: 'Carbon ceramic', lowered: 'Sport lowered', rally: 'Rally raised', v8: 'V8 rumble', diesel: 'Diesel chug', electric: 'Electric whine', sport: 'Sport', race: 'Race', carbon: 'Carbon', vented: 'Vented', scoop: 'Intake scoop', rack: 'Utility rack', diffuser: 'Rear diffuser', lip: 'Ducktail lip', wing: 'GT wing', dual: 'Dual tips', quad: 'Quad tips', ice: 'Ice white', amber: 'Amber', light: 'Light', dark: 'Dark', off: 'Off', cyan: 'Cyan', purple: 'Violet', red: 'Red', gloss: 'Gloss', metallic: 'Metallic', matte: 'Matte' };
const HELP: Partial<Record<PartKey, string>> = {
  engine: 'From street tuning to extreme power packages. Live build figures update with every specification.',
  transmission: 'Close ratios and competition gearing increase acceleration across four specifications per series.', brakes: 'Sport increases braking force 15%; ceramic 30%.',
  tyres: 'Slicks add grip. Drift tires loosen the rear. All-terrain uses chunky tread with slightly less road grip.',
  suspension: 'Street and club lower the body within wheel-arch clearance. Rally raises ride height.',
  sound: 'Preview a short rev using the same engine sound you will hear while driving.',
};
const COLORS = ['#d8dce2', '#111820', '#ef4035', '#f69b32', '#f1d758', '#257dea', '#32b79b', '#8d57da', '#ee7aaa', '#6a7952', '#69332b', '#ffffff'];
function PartArt({ part, option }: { part: PartKey; option: string }) {
  const detail = partProfile(option);
  const spokes = detail.stage ? 4 + detail.family + detail.stage : option === 'mesh' ? 10 : 5;
  const wheel = part === 'rims' || part === 'tyres' || part === 'brakes';
  return <svg viewBox="0 0 120 64" aria-hidden="true" className="garage-part-art">
    {wheel ? <><circle cx="60" cy="32" r="25" fill="#151c23" stroke="currentColor" strokeWidth="3" /><circle cx="60" cy="32" r="16" fill={option === 'disc' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" />{Array.from({ length: spokes }, (_, i) => <path key={i} d="M60 32 L60 16" transform={`rotate(${i * (360 / spokes)} 60 32)`} stroke="currentColor" strokeWidth="3" />)}</>
      : part === 'sound' ? <>{[12, 23, 36, 48, 28, 16, 36, 22].map((h, i) => <rect key={i} x={18 + i * 11} y={32 - h / 2} width="4" height={h} rx="2" fill="currentColor" />)}</>
        : part === 'engine' || part === 'transmission' ? <><path d="M30 20h44l17 10v22H26V30h-8V18h12z" fill="none" stroke="currentColor" strokeWidth="3"/><path d="M42 12h28M55 12v8M38 32v10m12-10v10m12-10v10m12-10v10" stroke="currentColor" strokeWidth="4"/></>
          : part === 'suspension' ? <path d="M60 6v8l-18 6 36 8-36 8 36 8-18 6v8" fill="none" stroke="currentColor" strokeWidth="4" />
            : <><path d={part === 'spoiler' ? 'M22 20h76v8H22zM40 28v22m40-22v22' : part === 'exhaust' ? 'M24 18h22v34H24zM74 18h22v34H74z' : 'M19 42l13-22h56l13 22-9 10H28z'} fill="none" stroke="currentColor" strokeWidth="3" /><path d="M38 32h44" stroke="currentColor" strokeWidth={option === 'stock' ? 1 : 5} /></>}
  </svg>;
}

export function Garage({ engine, onClose, onCreateServer }: { engine: WorldEngine; onClose(): void; onCreateServer(name: string, visibility: 'public' | 'private'): Promise<void> }) {
  const [kind, setKind] = useState<VehicleKind>(engine.simulation.vehicleKind);
  const [build, setBuild] = useState(() => engine.garageBuild(engine.simulation.vehicleKind));
  const [saved, setSaved] = useState(() => JSON.stringify(build));
  const [category, setCategory] = useState<Category>('Paint');
  const [part, setPart] = useState<PartKey>('finish');
  const [view, setView] = useState('orbit');
  const [search, setSearch] = useState('');
  const [series, setSeries] = useState('all');
  const partPreviews = useGaragePartPreviews(kind, build, part);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [confirmLeave, setConfirmLeave] = useState(false);
  const [playing, setPlaying] = useState(false), [serverForm, setServerForm] = useState(false), [serverName, setServerName] = useState('Motor Club'), [visibility, setVisibility] = useState<'public' | 'private'>('private');
  const audio = useRef<VehicleAudio | null>(null), audioTimer = useRef(0), audioStop = useRef(0);
  const dialog = useRef<HTMLDivElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const dirty = JSON.stringify(build) !== saved;
  const stopAudio = () => { clearInterval(audioTimer.current); clearTimeout(audioStop.current); audio.current?.dispose(); audio.current = null; setPlaying(false); };
  useEffect(() => { closeButton.current?.focus(); return () => { clearInterval(audioTimer.current); clearTimeout(audioStop.current); audio.current?.dispose(); }; }, []);
  const close = () => { if (busy) return; if (dirty) setConfirmLeave(true); else onClose(); };
  const choose = <K extends keyof VehicleCustomization>(key: K, value: VehicleCustomization[K]) => { setBuild(b => ({ ...b, [key]: value })); setMessage(''); if (key === 'sound') stopAudio(); };
  const selectPart = (key: PartKey) => {
    setPart(key); setSearch(''); setSeries('all');
    setView(key === 'hood' || key === 'frontBumper' || key === 'lights' ? 'front' : ['rearBumper', 'spoiler', 'exhaust'].includes(key) ? 'rear' : key === 'roof' ? 'top' : ['rims', 'tyres', 'skirts', 'suspension'].includes(key) ? 'side' : 'orbit');
  };
  const save = async () => {
    const session = loadSession(); if (!session) { setMessage('Sign in before saving this build.'); return; }
    setBusy(true); setMessage('Saving your build…');
    try { const result = await persistBuild(session, kind, build); engine.installGarageBuild(kind, build); setSaved(JSON.stringify(build)); setMessage(result); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Save failed. Your changes are still here.'); }
    finally { setBusy(false); }
  };
  const previewSound = () => {
    if (playing) { stopAudio(); return; }
    const voice = new VehicleAudio(); audio.current = voice; const started = performance.now();
    const tick = () => { const t = (performance.now() - started) / 1000; voice.updatePlayer({ kind, flavor: garageSound(build.sound), pitch: garagePitch(build.sound), speed: Math.max(0, Math.sin(Math.min(1, t / 3) * Math.PI)) * VEHICLES[kind].topSpeed * 0.8, topSpeed: VEHICLES[kind].topSpeed, load: 0.8, audible: true }); };
    tick(); setPlaying(true); audioTimer.current = window.setInterval(tick, 40); audioStop.current = window.setTimeout(stopAudio, 3200);
  };
  const modifiers = tuning(build), spec = VEHICLES[kind];
  const count = Object.keys(PART_OPTIONS).filter(k => build[k as PartKey] !== stockBuild(kind)[k as PartKey]).length + (build.paint !== stockBuild(kind).paint ? 1 : 0);
  const roofUnsupported = part === 'roof' && ['f1', 'convertible', 'buggy'].includes(kind);
  return <div className="garage-overlay" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="garage-title" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); close(); }
    if (event.key === 'Tab') {
      const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }}>
    <div className="garage-stage">
      <GaragePreview kind={kind} build={build} view={view} />
      <header className="garage-heading"><span className="garage-eyebrow">WEST DISTRICT / BAY 01</span><h1 id="garage-title">GARAGE<span>WEST DISTRICT MOTOR CLUB</span></h1><p>Build it. Tune it. Drive it.</p></header>
      <div className="garage-view-controls" aria-label="Preview camera">{['orbit', 'front', 'side', 'rear', 'top', 'cockpit'].map(v => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{v}</button>)}</div>

      <span className="garage-orbit-hint">DRAG TO ORBIT · SCROLL / PINCH TO ZOOM</span>
    </div>
    <aside className="garage-panel">
      <div className="garage-panel-top"><div><span className="garage-eyebrow">WORKSHOP / PARTS DEPARTMENT</span><h2>Build sheet</h2></div><button ref={closeButton} className="garage-close" aria-label="Leave garage" disabled={busy} onClick={close}>×</button></div>
      <nav className="garage-categories" aria-label="Customization categories">{CATEGORIES.map(c => <button key={c} aria-pressed={category === c} disabled={busy} onClick={() => { setCategory(c); if (PARTS[c][0]) selectPart(PARTS[c][0]); }}>{c}</button>)}</nav>
      <div className="garage-options">
      <div className="garage-specs"><div><span>IN THE BAY</span><h2>{spec.name}</h2><p>{count} upgrades · {dirty ? 'Unsaved changes' : 'Build ready'}</p></div><dl><div><dt>TOP SPEED*</dt><dd>{Math.round(spec.topSpeed * modifiers.speed * 3.6)} <small>km/h</small></dd></div><div><dt>ACCELERATION</dt><dd>{(spec.acceleration * modifiers.acceleration).toFixed(1)} <small>m/s²</small></dd></div><div><dt>GRIP</dt><dd>{Math.round(modifiers.grip * 100)}<small>%</small></dd></div></dl><small>*Build specification. Damage, road surface and boost affect driving.</small></div>
        {category !== 'My builds' && <div className="garage-presets"><span>QUICK BUILD</span>{['street', 'rally', 'extreme'].map(preset => <button disabled={busy} key={preset} onClick={() => { setBuild(current => { const next = { ...current }; for (const key of Object.keys(PART_OPTIONS) as PartKey[]) { if (key === 'roof' && ['f1', 'convertible', 'buggy'].includes(kind)) continue; Object.assign(next, { [key]: preset + '-4' }); } return next; }); stopAudio(); }}>{preset}</button>)}</div>}
        {category === 'Paint' && <><h3>Body color</h3><div className="garage-colors">{COLORS.map(color => <button key={color} style={{ background: color }} aria-label={`Paint ${color}`} aria-pressed={build.paint === color} disabled={busy} onClick={() => choose('paint', color)} />)}<label className="garage-custom-color">Custom<input type="color" aria-label="Custom body color" value={build.paint} disabled={busy} onChange={e => choose('paint', e.target.value)} /></label></div></>}
        {category === 'Wheels' && <label className="garage-color-label">Rim color<input type="color" value={build.rimColor} disabled={busy} onChange={e => choose('rimColor', e.target.value)} /></label>}
        {category !== 'My builds' && <><div className="garage-parts" aria-label="Part type">{PARTS[category].map(p => <button key={p} disabled={busy} aria-pressed={part === p} onClick={() => selectPart(p)}>{LABELS[p]}</button>)}</div><div className="garage-section-label"><h3>{LABELS[part]}</h3><span>{PART_OPTIONS[part].length} SPECS</span></div>{HELP[part] && <p className="garage-help">{HELP[part]}</p>}
          {roofUnsupported && <p className="garage-help">This vehicle has an open cockpit. Roof conversions are not compatible.</p>}
          <div className="garage-catalog-tools"><input aria-label="Find a part" placeholder="Find a part..." value={search} onChange={event => setSearch(event.target.value)} /><select aria-label="Part series" value={series} onChange={event => setSeries(event.target.value)}><option value="all">All series</option><option value="original">Original parts</option>{['street', 'club', 'rally', 'endurance', 'extreme'].map(value => <option key={value} value={value}>{value}</option>)}</select></div>
          <p className="garage-help">{spec.name} fitment ? Select a specification to fit it in the bay.</p>
          <div className="garage-items" key={`${part}-${series}-${search}`}>{PART_OPTIONS[part].filter(option => (LABELS[option] ?? partLabel(option)).toLowerCase().includes(search.toLowerCase()) && (series === 'all' || (series === 'original' ? partProfile(option).family < 0 : option.startsWith(series + '-')))).map(option => <button key={option} className="garage-item" disabled={busy || (roofUnsupported && option !== 'stock')} aria-pressed={build[part] === option} onClick={() => choose(part, option)}>{partPreviews[option] ? <img className="garage-part-preview" src={partPreviews[option]} alt={`${LABELS[part]}: ${LABELS[option] ?? partLabel(option)} fitted to ${spec.name}`} /> : <PartArt part={part} option={option} />}<strong>{LABELS[option] ?? partLabel(option)}</strong>{['engine', 'transmission', 'brakes', 'tyres', 'suspension'].includes(part) && <small className="garage-part-effect">{(() => { const t = tuning({ ...build, [part]: option }); return part === 'engine' ? Math.round(spec.topSpeed * t.speed * 3.6) + ' km/h' : part === 'transmission' ? (spec.acceleration * t.acceleration).toFixed(1) + ' m/s?' : part === 'brakes' ? Math.round(t.braking * 100) + '% braking' : Math.round(t.grip * 100) + '% grip'; })()}</small>}<small className="garage-spec-code">{partProfile(option).stage ? `SPEC 0${partProfile(option).stage} / ${LABELS[part]}` : "ORIGINAL SERIES"}</small><span>{build[part] === option ? '✓ FITTED' : 'PREVIEW PART'}</span></button>)}</div>
          {category === 'Sound' && <button className="garage-audio" onClick={previewSound}>{playing ? '■ Stop preview' : '▶ Preview engine sound'}</button>}
        </>}
        {category === 'My builds' && <><h3>Your saved collection</h3><p className="garage-help">One build per vehicle type. Bring another car to add it. Builds follow your account into solo and multiplayer.</p>{engine.garageRecords.length === 0 && <p>Save your first build to start your collection.</p>}{engine.garageRecords.map(record => <button className="garage-saved" key={record.kind} disabled={busy || dirty} onClick={() => { setKind(record.kind); setBuild({ ...record.customization }); setSaved(JSON.stringify(record.customization)); engine.installGarageBuild(record.kind, record.customization); setMessage('Build selected. Save to make it your returning vehicle.'); stopAudio(); }}><i style={{ background: record.customization.paint }} /><span><strong>{VEHICLES[record.kind].name}</strong><small>{record.kind === kind ? 'IN THE BAY' : 'LOAD BUILD'}</small></span><b>↗</b></button>)}{dirty && <p className="garage-help">Save or reset your changes before loading another build.</p>}</>}
      </div>
      <footer className="garage-footer"><p role="status" aria-live="polite">{message || (loadSession()?.token ? 'Account save · solo + multiplayer' : 'Offline · saves on this device')}</p><div className="garage-save-row"><button disabled={busy} onClick={() => { setBuild(engine.garageBuild(kind)); setMessage('Changes reset to your saved build.'); stopAudio(); }}>Reset changes</button><button className="garage-save" disabled={busy} onClick={() => void save()}>{busy ? 'SAVING…' : 'SAVE BUILD'} <span>↗</span></button></div><button className="garage-drive" disabled={busy || dirty} onClick={onClose}>DRIVE OUT →</button>
        {!loadSession()?.roomCode && <button className="garage-server-toggle" disabled={busy || dirty} onClick={() => setServerForm(!serverForm)}>Create a server from solo</button>}
        {serverForm && <form className="garage-server-form" onSubmit={async event => { event.preventDefault(); setBusy(true); try { await onCreateServer(serverName, visibility); setServerForm(false); setMessage('Server created. Your customized car is ready for friends.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not create server.'); } finally { setBusy(false); } }}><label>Server name<input value={serverName} minLength={3} maxLength={32} required disabled={busy} onChange={e => setServerName(e.target.value)} /></label><label>Visibility<select value={visibility} disabled={busy} onChange={e => setVisibility(e.target.value as 'public' | 'private')}><option value="private">Private — invite code</option><option value="public">Public — server browser</option></select></label><button className="garage-save" disabled={busy}>CREATE SERVER</button></form>}
      </footer>
    </aside>
    {confirmLeave && <div className="garage-confirm"><div><h2>Leave without saving?</h2><p>Your last saved build will stay fitted.</p><button onClick={() => setConfirmLeave(false)}>Keep customizing</button><button onClick={onClose}>Discard changes</button></div></div>}
  </div>;
}
