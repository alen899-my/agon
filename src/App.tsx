import { Garage } from './components/Garage';
import { readLookSettings } from './game/CameraInput';
import { VEHICLES } from './world/Vehicles';
import { GUNS } from './world/Guns';
import { WeaponDock } from './components/WeaponDock';
import { ApiRequestError, createRoom as apiCreateRoom, joinRoom as apiJoinRoom, inviteCodeFromUrl, inviteLink, leaveRoom as apiLeaveRoom, login as apiLogin, me as apiMe, type RoomVisibility } from './api/client';
import { EntryScreen, type CreatedServer, type EntryTab } from './components/EntryScreen';
import { loadSession, saveSession, type Session } from './api/session';
﻿import { useEffect, useRef, useState } from 'react';
import { GameMenu } from './components/GameMenu';
import { WorldViewport } from './components/WorldViewport';
import { WindshieldRain } from './components/WindshieldRain';
import { WorldControls } from './components/WorldControls';
import { TableTennisControls } from './components/TableTennisControls';
import { BasketballControls } from './components/BasketballControls';
import { DistrictMap, WorldMap } from './components/DistrictMap';
import { PhysicsChecklist } from './components/PhysicsChecklist';
import { RaceCountdown, RaceDirectory, RaceFinishToast, RaceLeaderboard, RaceLobby, RaceResults, SoloRaceSetup, F1RaceDirectory, F1SoloSetup, F1Hud } from './components/RaceUI';
import type { VehicleKind } from './world/Vehicles';
import type { Theme } from './game/State';
import type { WorldEngine, QualityLevel } from './world/WorldEngine';
import type { WorldSnapshot } from './world/Simulation';
import { clampIntensity, type IntensityLevel, type Season, type Weather } from './world/Weather';

function initialTheme(): Theme {
  try { const saved = localStorage.getItem('agon-theme'); if (saved === 'light' || saved === 'dark' || saved === 'color') return saved; } catch { /* Optional storage. */ }
  return 'light';
}
function initialQuality(): QualityLevel {
  try {
    const saved = localStorage.getItem('agon-quality');
    if (saved === 'low' || saved === 'balanced' || saved === 'high' || saved === 'ultra') return saved;
  } catch { /* Optional storage. */ }
  return 'balanced';
}
function initialWeather(): Weather {
  try {
    const saved = localStorage.getItem('agon-weather');
    if (saved === 'normal' || saved === 'rain' || saved === 'snow') return saved;
  } catch { /* Optional storage. */ }
  return 'normal';
}
const portraitQuery = '(orientation: portrait) and (max-width: 1000px)';
export default function App() {
  const engine = useRef<WorldEngine | null>(null);
  const [state, setState] = useState<WorldSnapshot | null>(null);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [weather, setWeather] = useState<Weather>(initialWeather);
  const [season, setSeason] = useState<Season>(() => {
    try {
      const saved = localStorage.getItem('agon-season');
      if (saved === 'spring' || saved === 'summer' || saved === 'autumn' || saved === 'winter') return saved;
    } catch { /* Optional storage. */ }
    return 'spring';
  });
  const [quality, setQuality] = useState<QualityLevel>(initialQuality);
  const [portrait, setPortrait] = useState(() => matchMedia(portraitQuery).matches);
  const [mapOpen, setMapOpen] = useState(false);
  const [garageOpen, setGarageOpen] = useState(false);
  useEffect(() => {
    const open = () => { setGarageOpen(true); engine.current?.setSuspended(true); };
    window.addEventListener('agon:garage', open);
    return () => window.removeEventListener('agon:garage', open);
  }, []);
  const resumeAfterMap = useRef(false);
  const [notice, setNotice] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [physicsOpen, setPhysicsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const resumeAfterMenu = useRef(false);
  const [lookSettings, setLookSettings] = useState(readLookSettings);
  const [name, setName] = useState(() => loadSession()?.name ?? '');
  const [entering, setEntering] = useState(false);
  const [enterNote, setEnterNote] = useState('');
  const [mode, setMode] = useState<EntryTab>('solo');
  const [roomCode, setRoomCode] = useState('');
  const [created, setCreated] = useState<CreatedServer | null>(null);
  const [joinedRoom, setJoinedRoom] = useState<{ name: string; visibility: RoomVisibility } | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [raceOpen, setRaceOpen] = useState(false);
  const [raceTab, setRaceTab] = useState<'solo' | 'multi'>('solo');
  const [f1RaceOpen, setF1RaceOpen] = useState(false);
  const [f1RaceTab, setF1RaceTab] = useState<'solo' | 'multi'>('solo');
  const [raceLaps, setRaceLaps] = useState(3);
  const [raceCar, setRaceCar] = useState<VehicleKind>('super');
  const [gunHint, setGunHint] = useState('');
  const gunHintTimer = useRef(0);
  const flashGunHint = (msg: string) => {
    setGunHint(msg);
    window.clearTimeout(gunHintTimer.current);
    gunHintTimer.current = window.setTimeout(() => setGunHint(''), 2200);
  };
  const pendingToken = useRef<Session | null>(null);
  const entryLock = useRef(false);
  const restoreTried = useRef(false);
  const initialSession = useRef(loadSession());
  useEffect(() => { try { localStorage.setItem('agon-look', JSON.stringify(lookSettings)); } catch { /* Optional storage. */ } }, [lookSettings]);
  useEffect(() => {
    const media = matchMedia(portraitQuery);
    const rotate = () => setPortrait(media.matches);
    const full = () => setFullscreen(Boolean(document.fullscreenElement));
    media.addEventListener('change', rotate); document.addEventListener('fullscreenchange', full);
    return () => { media.removeEventListener('change', rotate); document.removeEventListener('fullscreenchange', full); };
  }, []);
  useEffect(() => {
    const onGunHint = (e: Event) => flashGunHint((e as CustomEvent<string>).detail || '');
    window.addEventListener('agon:gunhint', onGunHint);
    return () => window.removeEventListener('agon:gunhint', onGunHint);
  }, []);
  useEffect(() => {
    const dark = theme === 'dark';
    document.documentElement.classList.toggle('dark', dark); document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111111' : '#f4f4f4');
    try { localStorage.setItem('agon-theme', theme); } catch { /* Optional storage. */ }
  }, [theme]);
  useEffect(() => {
    try { localStorage.setItem('agon-quality', quality); } catch { /* Optional storage. */ }
  }, [quality]);
  useEffect(() => {
    try { localStorage.setItem('agon-weather', weather); } catch { /* Optional storage. */ }
  }, [weather]);
  useEffect(() => {
    try { localStorage.setItem('agon-season', season); } catch { /* Optional storage. */ }
  }, [season]);
  const [intensity, setIntensity] = useState<IntensityLevel>(() => {
    try {
      const saved = Number(localStorage.getItem('agon-intensity'));
      if (Number.isFinite(saved)) return clampIntensity(saved);
    } catch { /* Optional storage. */ }
    return 3;
  });
  useEffect(() => {
    try { localStorage.setItem('agon-intensity', String(intensity)); } catch { /* Optional storage. */ }
  }, [intensity]);
  const focus = () => document.querySelector<HTMLCanvasElement>('canvas')?.focus();
  const rememberRoom = (session: Session) => {
    saveSession(session);
    pendingToken.current = session;
    setRoomCode(session.roomCode ?? '');
  };
  const refreshSession = async (saved: Session): Promise<Session> => {
    try {
      const { player } = await apiMe(saved.token);
      if (!player) throw new ApiRequestError(401, 'unauthorized', 'Please sign in again.');
      return { ...saved, id: player.id, name: player.name };
    } catch (error) {
      if (!(error instanceof ApiRequestError) || error.status !== 401) throw error;
      const { token, player } = await apiLogin(saved.name);
      return { ...saved, token, id: player.id, name: player.name };
    }
  };
  const connectAndEnter = async (session: Session) => {
    const world = engine.current;
    if (!world) throw new Error('The world is still loading. Please try again.');
    setEnterNote('Connecting to server ' + session.roomCode + '...');
    world.setAuthToken(session.token);
    await world.joinRoomSession(session.token, session.roomCode!);
    world.setPlayerName(session.name);
    const garageNotice = await world.restoreGarage(session); if (garageNotice) setNotice(garageNotice);
    world.begin();
    rememberRoom(session);
    setEnterNote('');
    focus();
  };
  const entryDisplayName = () => name.trim().replace(/\s+/g, ' ');
  const enterSolo = async () => {
    if (!state || !engine.current || entryLock.current) return;
    restoreTried.current = true;
    const display = entryDisplayName();
    if (!display) { setEnterNote('Enter your name before continuing.'); return; }
    entryLock.current = true;
    setEntering(true); setEnterNote('Signing in...');
    try {
      const { token, player } = await apiLogin(display);
      const session: Session = { token, name: player.name, id: player.id };
      const previous = loadSession();
      engine.current.leaveRoomSession();
      saveSession(session);
      pendingToken.current = null; setCreated(null); setJoinedRoom(null);
      if (previous?.roomCode && previous.token) void apiLeaveRoom(previous.token, previous.roomCode).catch(() => undefined);
      engine.current.setAuthToken(token);
      engine.current.setPlayerName(player.name);
      const garageNotice = await engine.current.restoreGarage(session); if (garageNotice) setNotice(garageNotice);
      engine.current.begin(); focus(); setEnterNote('');
    } catch (error) {
      // Solo may fall back to offline gameplay when the API is unreachable.
      if (error instanceof ApiRequestError && error.status === 0) {
        engine.current?.leaveRoomSession();
        saveSession({ token: '', name: display, id: 'offline' });
        pendingToken.current = null; setCreated(null); setJoinedRoom(null);
        engine.current?.setAuthToken(null);
        engine.current?.setPlayerName(display);
        await engine.current?.restoreGarage({ token: '', name: display, id: 'offline' });
        engine.current?.begin(); focus();
        setNotice('Playing solo offline. ' + error.message);
      } else {
        engine.current?.leaveRoomSession();
        setEnterNote(error instanceof Error ? error.message : 'Could not join the server. Please try again.');
      }
    } finally { entryLock.current = false; setEntering(false); }
  };
  const createServer = async (serverName: string, visibility: RoomVisibility) => {
    if (!state || !engine.current || entryLock.current) return;
    restoreTried.current = true;
    const display = entryDisplayName();
    if (!display) { setEnterNote('Enter your name before continuing.'); return; }
    if (serverName && (serverName.length < 3 || serverName.length > 32)) {
      setEnterNote('Server names are 3–32 characters.'); return;
    }
    entryLock.current = true;
    setEntering(true); setEnterNote('Creating your server...');
    try {
      const { token, player } = await apiLogin(display);
      const session: Session = { token, name: player.name, id: player.id };
      const { room } = await apiCreateRoom(token, { name: serverName || undefined, visibility });
      const staleBackend = !room.visibility || !room.name;
      rememberRoom({ ...session, roomCode: room.code });
      setCreated({ code: room.code, name: room.name ?? room.code, visibility: room.visibility ?? 'private' });
      setJoinedRoom({ name: room.name ?? room.code, visibility: room.visibility ?? 'private' });
      setCopied(false); setLinkCopied(false);
      // An old backend creates a nameless private room and ignores the new fields — say so.
      setEnterNote(staleBackend
        ? 'Server created, but the API is running old code — restart it (`npm run dev` in server/) so names, visibility and the browser work.'
        : '');
    } catch (error) {
      engine.current?.leaveRoomSession();
      setEnterNote(error instanceof Error ? error.message : 'Could not create the server. Please try again.');
    } finally { entryLock.current = false; setEntering(false); }
  };
  const enterCreated = async () => {
    if (!state || !engine.current || entryLock.current || !created || !pendingToken.current) return;
    restoreTried.current = true;
    const target = created.code;
    entryLock.current = true;
    setEntering(true); setEnterNote('Signing in...');
    try {
      const session = await refreshSession(pendingToken.current);
      const { room } = await apiJoinRoom(session.token, target);
      rememberRoom({ ...session, roomCode: room.code });
      setJoinedRoom({ name: room.name ?? room.code, visibility: room.visibility ?? 'private' });
      await connectAndEnter({ ...session, roomCode: room.code });
    } catch (error) {
      engine.current?.leaveRoomSession();
      setEnterNote(error instanceof Error ? error.message : 'Could not join the server. Please try again.');
      if (error instanceof ApiRequestError && ['room_not_found', 'room_expired'].includes(error.code)) {
        const saved = loadSession();
        if (saved?.roomCode === target) saveSession({ token: saved.token, name: saved.name, id: saved.id });
        setCreated(null); setJoinedRoom(null); pendingToken.current = null;
      }
    } finally { entryLock.current = false; setEntering(false); }
  };
  const joinServer = async (rawCode: string) => {
    if (!state || !engine.current || entryLock.current) return;
    restoreTried.current = true;
    const display = entryDisplayName();
    if (!display) { setEnterNote('Enter your name before continuing.'); return; }
    const code = rawCode.trim().toUpperCase().replace(/[\s-]+/g, '');
    if (!/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(code)) {
      setEnterNote('Enter a valid 6-character server code. Codes do not contain I, O, 0 or 1.'); return;
    }
    entryLock.current = true;
    setEntering(true); setEnterNote('Joining server ' + code + '...');
    try {
      const { token, player } = await apiLogin(display);
      const session: Session = { token, name: player.name, id: player.id };
      const { room } = await apiJoinRoom(token, code);
      rememberRoom({ ...session, roomCode: room.code });
      setJoinedRoom({ name: room.name ?? room.code, visibility: room.visibility ?? 'private' });
      await connectAndEnter({ ...session, roomCode: room.code });
    } catch (error) {
      engine.current?.leaveRoomSession();
      setEnterNote(error instanceof Error ? error.message : 'Could not join the server. Please try again.');
    } finally { entryLock.current = false; setEntering(false); }
  };
  const createServerFromSolo = async (serverName: string, visibility: RoomVisibility) => {
    const current = loadSession();
    if (!current || !engine.current) throw new Error('Sign in before creating a server.');
    const session = current.token ? await refreshSession(current) : await apiLogin(current.name).then(({ token, player }) => ({ token, name: player.name, id: player.id }));
    const { room } = await apiCreateRoom(session.token, { name: serverName, visibility });
    engine.current.setAuthToken(session.token);
    await engine.current.joinRoomSession(session.token, room.code);
    rememberRoom({ ...session, roomCode: room.code });
    setJoinedRoom({ name: room.name, visibility: room.visibility });
    setNotice('Server ' + room.code + ' created. Share the code from the menu.');
  };
  const leaveServer = async () => {
    if (entryLock.current) return;
    entryLock.current = true; setEntering(true);
    const session = loadSession();
    // Stop reconnection and remove the reload target before awaiting the API.
    engine.current?.setAuthToken(session?.token ?? null);
    engine.current?.leaveRoomSession(); engine.current?.exitToIntro();
    if (session) saveSession({ token: session.token, name: session.name, id: session.id });
    setRaceOpen(false); setF1RaceOpen(false); setCreated(null); setJoinedRoom(null); setCopied(false); setLinkCopied(false); setRoomCode(''); setMode('solo');
    pendingToken.current = null; setEnterNote('');
    try {
      if (session?.roomCode && session.token) await apiLeaveRoom(session.token, session.roomCode);
    } catch {
      setEnterNote('Disconnected locally. The server could not confirm that your membership was removed.');
    } finally { entryLock.current = false; setEntering(false); focus(); }
  };
  const restoreServer = async (saved: Session) => {
    if (entryLock.current || !saved.roomCode || !engine.current) return;
    entryLock.current = true; setEntering(true);
    setMode('join'); setRoomCode(saved.roomCode); setName(saved.name);
    setEnterNote('Reconnecting to server ' + saved.roomCode + '...');
    try {
      const session = await refreshSession(saved);
      const { room } = await apiJoinRoom(session.token, saved.roomCode);
      rememberRoom({ ...session, roomCode: room.code });
      setJoinedRoom({ name: room.name ?? room.code, visibility: room.visibility ?? 'private' });
      await connectAndEnter({ ...session, roomCode: room.code });
    } catch (error) {
      engine.current?.leaveRoomSession(); engine.current?.exitToIntro();
      const permanent = error instanceof ApiRequestError && ['room_not_found', 'room_expired', 'invalid_code'].includes(error.code);
      if (permanent) {
        const current = loadSession() ?? saved;
        saveSession({ token: current.token, name: current.name, id: current.id });
        pendingToken.current = null;
      }
      setEnterNote((error instanceof Error ? error.message : 'Could not reconnect.') +
        (permanent ? ' Create a server or enter a new code.' : ' Your server code is saved. Press JOIN WORLD to retry.'));
    } finally { entryLock.current = false; setEntering(false); }
  };
  useEffect(() => {
    if (!state || !engine.current || restoreTried.current) return;
    // Mark even a fresh visit as checked; creating a room must not trigger restore.
    restoreTried.current = true;
    const saved = initialSession.current;
    const invited = inviteCodeFromUrl();
    if (invited && saved?.roomCode !== invited) {
      setMode('join'); setRoomCode(invited);
      if (saved?.name) setName(saved.name);
      setEnterNote('You were invited to server ' + invited + '. Enter your name and press JOIN WORLD.');
      try { history.replaceState(null, '', location.pathname); } catch { /* The invite still works without cleanup. */ }
      return;
    }
    if (saved?.token && saved.roomCode && saved.name) void restoreServer(saved);
  }, [state]);
  const copyCode = async () => {
    if (!created) return;
    try { await navigator.clipboard.writeText(created.code); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { setCopied(false); setEnterNote('Copy failed. Select and copy the server code manually.'); }
  };
  const copyLink = async () => {
    if (!created) return;
    try { await navigator.clipboard.writeText(inviteLink(created.code)); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1500); }
    catch { setLinkCopied(false); setEnterNote('Copy failed. Copy the invite link shown above manually.'); }
  };
  const switchMode = (next: EntryTab) => {
    if (entryLock.current) return;
    setMode(next); setEnterNote(''); setCopied(false); setLinkCopied(false);
  };
  const handleName = (value: string) => {
    setName(value);
    // Tokens are bound to the login name; a rename invalidates a staged server.
    if (created) { setCreated(null); setJoinedRoom(null); pendingToken.current = null; }
  };
  const toggleMap = () => {
    if (!mapOpen) { resumeAfterMap.current = engine.current?.simulation.active ?? false; if (resumeAfterMap.current) engine.current?.togglePause(); }
    else if (resumeAfterMap.current && engine.current?.simulation.paused) engine.current.togglePause();
    setMapOpen(!mapOpen);
  };
  const enterFullscreen = async () => {
    try {
      if (document.fullscreenElement) { await document.exitFullscreen(); return; }
      const stage = document.querySelector('.world-stage') as HTMLElement | null;
      const target = stage ?? document.documentElement;
      if (!target.requestFullscreen) { setNotice('Fullscreen is not available here. Rotate your phone to landscape to explore.'); return; }
      // Request fullscreen on the world stage so only the game world shows (no header/footer/menus).
      await target.requestFullscreen();
      const orientation = screen.orientation as ScreenOrientation & { lock?: (value: string) => Promise<void> };
      try { await orientation.lock?.('landscape'); } catch { /* Manual rotation works too. */ }
    } catch { setNotice('Fullscreen was unavailable. You can explore in this window.'); }
  };
  const ready = !state || state.phase === 'ready';
  const active = !ready && !state?.paused && !portrait && !mapOpen && !physicsOpen && !menuOpen && !raceOpen && !f1RaceOpen && !garageOpen;
  /** In-canvas menu: pauses like the map, resumes on close only if it paused. */
  const toggleMenu = (open: boolean) => {
    if (open) {
      resumeAfterMenu.current = engine.current?.simulation.active ?? false;
      if (resumeAfterMenu.current) engine.current?.togglePause();
    } else if (resumeAfterMenu.current && engine.current?.simulation.paused) {
      engine.current.togglePause();
      resumeAfterMenu.current = false;
    }
    setMenuOpen(open);
  };
  const copyServerCode = async () => {
    if (!state?.room) return;
    try {
      await navigator.clipboard.writeText(state.room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };
  return <main className={`district-shell${fullscreen ? ' is-fullscreen' : ''}`}>
    <section className={`world-stage${menuOpen || mapOpen || garageOpen || physicsOpen || state?.paused ? ' hud-obscured' : ''}${state?.driving ? ' is-driving' : ''}${state?.armed ? ' is-armed' : ''}${engine.current?.raceGuidanceActive ? ' is-racing' : ''}`} aria-label="Open world neighborhood">
      <WorldViewport engineRef={engine} onSnapshot={setState} onMap={toggleMap} theme={theme} weather={weather} season={season} intensity={intensity} quality={quality} portrait={portrait} blocked={mapOpen || physicsOpen || menuOpen || raceOpen || f1RaceOpen || garageOpen}
        onDismissOverlay={() => { if (physicsOpen) setPhysicsOpen(false); else if (menuOpen) { toggleMenu(false); focus(); } else if (mapOpen) toggleMap(); }}
        lookSettings={lookSettings} lookEnabled={active && state?.mode === 'roam'} />
      {state && state.phase === 'playing' && state.driving && state.view === 'first' && (state.weather === 'rain' || state.wiperMode === 'on') && (
        <WindshieldRain
          level={intensity} paused={state.paused}
          raining={state.weather === 'rain'}
          wipersActive={state.wiperMode === 'on' || (state.wiperMode === 'auto' && state.weather === 'rain')}
          visible={(() => {
            let d = state.yaw - state.car.yaw;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            return Math.abs(d) < 0.35;
          })()}
        />
      )}
      {state && state.phase !== 'ready' && state.weather === 'snow' && (
        <div
          className="weather-veil is-snow"
          aria-hidden="true"
          style={{ opacity: [0.08, 0.12, 0.16, 0.24, 0.34][intensity - 1] }}
        />
      )}
      <div className="canvas-corner">
        {!ready && state?.mode === 'roam' && state.driving && engine.current?.race.phase === 'idle' && <button className="control mobile-vehicle-switch" disabled={!active || Math.abs(state.car.speed) > 0.2} onClick={() => { engine.current?.cycleVehicle(); focus(); }} aria-label="Switch vehicle" title={Math.abs(state.car.speed) > 0.2 ? 'Stop to switch vehicle' : 'Switch vehicle'}><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 10l2-4h10l2 4M4 10h16v7H4zM7 13h1m8 0h1M6 17v2m12-2v2M3 3h7m-2-2l2 2-2 2M21 21h-7m2-2l-2 2 2 2" /></svg></button>}
        {!ready && state?.mode === 'roam' && !state?.driving && state?.armed && (
          <WeaponDock
            armed={state?.armed ?? false}
            gunIndex={state?.gunIndex ?? 0}
            mag={state?.mag ?? 0}
            reloading={state?.reloading ?? false}
            reloadT={state?.reloadT ?? 0}
            reloadDur={state?.reloadDur ?? 1}
            disabled={!active}
            onPrev={() => { const i = state?.gunIndex ?? 0; engine.current?.selectGun(state?.armed ? i - 1 : GUNS.length - 1); focus(); }}
            onNext={() => { const i = state?.gunIndex ?? 0; engine.current?.selectGun(state?.armed ? i + 1 : 0); focus(); }}
            onArm={() => { engine.current?.cycleGun(); focus(); }}
            onDisarm={() => { engine.current?.disarm(); focus(); }}
          />
        )}
        <button className="control" onClick={() => toggleMenu(true)} aria-label="Open menu" aria-expanded={menuOpen}>☰</button>
      </div>
      {garageOpen && engine.current && <Garage engine={engine.current} onCreateServer={createServerFromSolo} onClose={() => { setGarageOpen(false); if (engine.current) { engine.current.simulation.paused = false; engine.current.setSuspended(false); } focus(); }} />}
      {!ready && !garageOpen && state?.mode === 'roam' && state.driving && engine.current?.garageAvailable && <div className="garage-entry"><button disabled={!active} onClick={() => engine.current?.openGarage()}>Enter garage <kbd>E</kbd></button></div>}
      {menuOpen && <GameMenu
        onGarageRoute={() => { engine.current?.waypoint('garage'); toggleMenu(false); focus(); }}
        onCycleVehicle={() => engine.current?.cycleVehicle()}
        onEquip={() => { engine.current?.cycleGun(); toggleMenu(false); focus(); }}
        theme={theme} onTheme={setTheme}
        weather={weather} onWeather={setWeather}
        season={season} onSeason={setSeason}
        intensity={intensity} onIntensity={setIntensity}
        quality={quality} onQuality={setQuality}
        fullscreen={fullscreen} onToggleFullscreen={enterFullscreen}
        view={state?.view} onToggleView={() => { engine.current?.toggleView(); }}
        look={lookSettings} onLook={setLookSettings}
        onOpenMap={() => { toggleMenu(false); toggleMap(); focus(); }}
        physicsOpen={physicsOpen} onTogglePhysics={() => { toggleMenu(false); setPhysicsOpen(true); focus(); }}
        paused={state?.paused ?? false} pauseDisabled={ready || mapOpen}
        onTogglePause={() => { toggleMenu(false); engine.current?.togglePause(); focus(); }}
        roomCode={state?.room?.code ?? null} roomMembers={state?.room?.members ?? 0}
        roomName={joinedRoom?.name ?? created?.name ?? null} roomVisibility={joinedRoom?.visibility ?? created?.visibility ?? null}
        copied={copied} onCopyCode={() => void copyServerCode()} onLeaveServer={() => { toggleMenu(false); void leaveServer(); }}
        snapshot={state}
        onClose={() => { toggleMenu(false); focus(); }}
      />}
      {ready && <EntryScreen
        name={name} onName={handleName}
        tab={mode} onTab={switchMode}
        roomCode={roomCode} onRoomCode={setRoomCode}
        entering={entering} enterNote={enterNote}
        created={created} copied={copied} linkCopied={linkCopied}
        onCopyCode={() => void copyCode()} onCopyLink={() => void copyLink()}
        onSolo={() => void enterSolo()}
        onCreate={(serverName, visibility) => void createServer(serverName, visibility)}
        onEnterCreated={() => void enterCreated()}
        onJoin={(code) => void joinServer(code)}
      />}
      {!ready && <>
        {engine.current?.connectionNotice && <div className="connection-notice" role="alert">
          <span>{engine.current.connectionNotice}</span>
          <button className="control" disabled={entering} onClick={() => { const saved = loadSession(); if (saved) void restoreServer(saved); }}>REJOIN</button>
          <button className="control" disabled={entering} onClick={() => void leaveServer()}>LEAVE SERVER</button>
        </div>}
        {state?.driving && !(engine.current?.race.track === 'f1' && engine.current?.race.phase === 'racing') && <div className="hud-speedometer" aria-label={`Speed ${state.speed} kilometers per hour`}><span>{VEHICLES[state.vehicleKind].name}</span><div><b>{state.speed}</b><small>km/h</small></div>{state.damage >= 30 && <small className="hud-damage">Vehicle damage {state.damage}%</small>}{state.blinkerManual && state.blinker !== 0 && <small>{state.blinker === 1 ? 'LEFT' : state.blinker === 2 ? 'RIGHT' : 'HAZARDS'}</small>}</div>}
        {(engine.current?.race.track !== 'f1' || engine.current?.race.phase === 'idle') && <button className="hud-map-br" onClick={toggleMap} aria-label="Open district map"><DistrictMap state={state} theme={theme} raceActive={engine.current?.raceGuidanceActive ?? false} raceTrack={engine.current?.race.track} /></button>}
        {state?.armed && !state?.driving && state?.mode === 'roam' && (
          <div
            className="aim-crosshair"
            aria-hidden="true"
            style={state.view === 'third' ? {
              left: `${(state.aimScreenX ?? 0.5) * 100}%`,
              top: `${(state.aimScreenY ?? 0.5) * 100}%`,
            } : undefined}
          >
            <span className={state != null && state.hitSeq > 0 && state.time - state.hitAt < 0.3 ? (state.hitKill ? 'hit kill' : 'hit') : ''}>＋</span>
          </div>
        )}

        {state?.aiming && !state?.driving && state?.mode === 'roam' && (GUNS[state?.gunIndex ?? 0]?.scoped) && (
          <div className="scope-overlay" aria-hidden="true">
            <div className="scope-ring" />
            <div className="scope-cross-h" />
            <div className="scope-cross-v" />
            <div className="scope-mils"><i /><i /><i /><i /></div>
          </div>
        )}
        {gunHint && <div className="gun-hint" role="status">{gunHint}</div>}
        {(state?.wanted ?? 0) > 0 && (
          <div className="hud-wanted" role="status" aria-label={`Wanted level ${state?.wanted} of 5`}>
            {'★'.repeat(Math.min(5, state?.wanted ?? 0))}{'☆'.repeat(5 - Math.min(5, state?.wanted ?? 0))}
          </div>
        )}
        {state?.dead && (
          <div className="wasted-cover" role="alert" aria-label="Wasted">
            <h2>WASTED</h2>
            <p>respawning in {Math.ceil(state?.wastedIn ?? 0)}…</p>
          </div>
        )}
        {state != null && state.bustedSeq > 0 && state.time - state.bustedAt < 3 && (
          <div className="wasted-cover" role="alert" aria-label="Busted">
            <h2>BUSTED</h2>
            <p>the cops impounded your ride…</p>
          </div>
        )}
        {state?.view === 'first' && !state.driving && !state.armed && <div className="crosshair" aria-hidden="true">+</div>}
        {state != null && state.pedBloodSeq > 0 && state.time - state.pedBloodAt < 1.5 &&
          <div key={state.pedBloodSeq} className="blood-splash" aria-hidden="true"><div className="blood-splash-drip" /></div>}
        {state?.mode === 'table' && state.table && <div className="tt-score" role="status" aria-label={`Table tennis score you ${state.table.you} AI ${state.table.aiScore}`}>
          <div><small>YOU</small><b>{state.table.you}</b>{state.table.server === 'you' && <i>●</i>}</div>
          <div className="tt-mid"><span>{state.table.phase === 'over' ? 'MATCH' : `RALLY ${state.table.rally}`}</span><small>{state.table.ballSpeedKmh} KM/H</small></div>
          <div><small>AI</small><b>{state.table.aiScore}</b>{state.table.server === 'ai' && <i>●</i>}</div>
        </div>}
        {state?.mode === 'table' && state?.table && <div className="tt-message" role="status">{state.table.message}</div>}
        {state?.mode === 'table' && state?.table?.matchOver && <button className="interact-button" onClick={() => { engine.current?.rematch(); focus(); }}>REMATCH <kbd>R</kbd></button>}
        {state?.mode === 'table' && <button className="tt-exit" onClick={() => { engine.current?.exitTable(); focus(); }} aria-label="Exit table tennis">✕ EXIT <kbd>X</kbd></button>}
        {state?.mode === 'basket' && state.basket && <div className="tt-score" role="status" aria-label={`Hoops ${state.basket.makes} of ${state.basket.attempts}`}>
          <div><small>MAKES</small><b>{state.basket.makes}/{state.basket.attempts}</b></div>
          <div className="tt-mid"><span>{state.basket.spotLabel}</span><small>STREAK {state.basket.streak} · BEST {state.basket.best}</small></div>
          <div className="bb-meter" aria-label={`Power ${Math.round(state.basket.power * 100)} percent`}><i style={{ height: `${Math.round(state.basket.power * 100)}%` }} /><em className="bb-green" style={{ bottom: `${Math.round(state.basket.greenLo * 100)}%`, height: `${Math.max(2, Math.round((state.basket.greenHi - state.basket.greenLo) * 100))}%` }} /><span>{Math.round(state.basket.power * 100)}</span></div>
        </div>}
        {state?.mode === 'basket' && state?.basket?.message && <div className="tt-message" role="status">{state.basket.message}</div>}
        {state?.mode === 'basket' && <button className="tt-exit" onClick={() => { engine.current?.exitBasket(); focus(); }} aria-label="Exit hoops">✕ EXIT <kbd>X</kbd></button>}
        <div className="context-actions" role="group" aria-label="Nearby interactions">
        {state?.mode === 'roam' && state?.nearHoop && !state?.driving && <button className="interact-button bb-play" onClick={() => { engine.current?.enterBasket(); focus(); }}>SHOOT HOOPS <kbd>E</kbd></button>}
        {state?.mode !== 'table' && state?.mode !== 'basket' && (state?.nearbyCar || (state?.driving && Math.abs(state.car.speed) < 0.5 && !engine.current?.garageAvailable) || (state?.nearTable && !state?.driving)) && <button className={state?.nearTable && !state.driving ? 'interact-button' : 'interact-button desktop-vehicle-interact'} onClick={() => { if (state?.nearTable && !state?.driving) engine.current?.enterTable(); else engine.current?.interact(); focus(); }}>{state.driving ? 'EXIT VEHICLE' : state?.nearTable && !state?.nearbyCar ? 'PLAY TABLE TENNIS' : (state?.enterHint ?? 'DRIVE')} <kbd>E</kbd></button>}
        {state?.mode === 'roam' && state?.nearArena && engine.current?.race.phase === 'idle' && !raceOpen && (
          <>

            <button className="interact-button race-paddock" onClick={() => { setRaceTab('multi'); setRaceOpen(true); engine.current?.requestRaceDir(); }}>RACE PADDOCK</button>
          </>
        )}
        {state?.mode === 'roam' && state?.nearF1Portal && engine.current?.race.phase === 'idle' && !raceOpen && !f1RaceOpen && (
          <button className="interact-button race-paddock f1-paddock" onClick={() => { setF1RaceTab('multi'); setF1RaceOpen(true); engine.current?.requestRaceDir(); }}>HOST / JOIN F1 RACE</button>
        )}
        </div>
        {raceOpen && raceTab === 'solo' && (
          <SoloRaceSetup
            engine={engine.current}
            raceCar={raceCar}
            onCar={setRaceCar}
            laps={raceLaps}
            onLaps={setRaceLaps}
            onStart={() => { setRaceOpen(false); focus(); }}
            onClose={() => setRaceOpen(false)}
            onSwitchTab={() => { setRaceTab('multi'); engine.current?.requestRaceDir(); }}
          />
        )}
        {raceOpen && raceTab === 'multi' && (
          <RaceDirectory
            engine={engine.current}
            inServer={!!state?.room}
            raceCar={raceCar}
            onCar={setRaceCar}
            laps={raceLaps}
            onLaps={setRaceLaps}
            onClose={() => setRaceOpen(false)}
            onJoined={() => { setRaceOpen(false); focus(); }}
            onSwitchTab={() => setRaceTab('solo')}
          />
        )}
        {f1RaceOpen && f1RaceTab === 'solo' && (
          <F1SoloSetup
            engine={engine.current}
            raceCar={raceCar}
            onCar={setRaceCar}
            laps={raceLaps}
            onLaps={setRaceLaps}
            onStart={() => { setF1RaceOpen(false); focus(); }}
            onClose={() => setF1RaceOpen(false)}
            onSwitchTab={() => { setF1RaceTab('multi'); engine.current?.requestRaceDir(); }}
          />
        )}
        {f1RaceOpen && f1RaceTab === 'multi' && (
          <F1RaceDirectory
            engine={engine.current}
            inServer={!!state?.room}
            raceCar={raceCar}
            onCar={setRaceCar}
            laps={raceLaps}
            onLaps={setRaceLaps}
            onClose={() => setF1RaceOpen(false)}
            onJoined={() => { setF1RaceOpen(false); focus(); }}
            onSwitchTab={() => setF1RaceTab('solo')}
          />
        )}
        {engine.current?.raceNotice && <div className="race-lobby" role="status">{engine.current.raceNotice}<button className="control" onClick={() => { if (engine.current) engine.current.raceNotice = ''; }}>DISMISS</button></div>}
        <RaceLobby engine={engine.current} inServer={!!state?.room} onNeedServer={() => { setRaceOpen(false); setF1RaceOpen(false); }} />
        <RaceCountdown engine={engine.current} />
        <RaceLeaderboard engine={engine.current} />
        <F1Hud engine={engine.current} state={state} drsOpen={!!state?.drsOpen} inPitLane={!!state?.inPitLane} racing={engine.current?.race.track === 'f1' && engine.current?.race.phase === 'racing'} />
        <RaceFinishToast engine={engine.current} />
        <RaceResults engine={engine.current} onRematch={() => { const e = engine.current; if (!e || !e.race.isHost) return; e.rematchRace(); focus(); }} onExit={() => { engine.current?.leaveRace(); setRaceOpen(false); setF1RaceOpen(false); focus(); }} />
        {state?.driving && state?.boostEnabled && (state.boosting || state.boost < 99) && (
          <div className={`nitro-bottom${state?.boosting ? ' hot' : ''}${(state?.boost ?? 100) >= 99 && !state?.boosting ? ' full' : ''}`} role="progressbar" aria-label={`Nitro ${state?.boost ?? 100} percent`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={state?.boost ?? 100}>
            <span className="nitro-label" aria-hidden="true">⚡ NITRO</span>
            <div className="nitro-track" aria-hidden="true"><i style={{ width: `${state?.boost ?? 100}%` }} /></div>
            <span className="nitro-pct" aria-hidden="true">{state?.boosting ? 'BOOST!' : `${state?.boost ?? 100}%`}</span>
          </div>
        )}
        {state?.mode === 'table'
          ? <TableTennisControls disabled={!active} onSwing={shot => engine.current?.tableSwing(shot)} />
          : state?.mode === 'basket'
          ? <BasketballControls disabled={!active} pumping={state?.basket?.pumping ?? false} onTap={() => engine.current?.basketTap()} />
          : <WorldControls vehicleInteraction={!!state && !state.dead && (state.driving || (!!state.nearbyCar && !state.nearTable && !state.nearHoop))} onVehicleInteract={() => { engine.current?.interact(); focus(); }} disabled={!active} driving={state?.driving ?? false} speed={state?.car.speed ?? 0} wiperMode={state?.wiperMode ?? 'auto'} boost={state?.boost ?? 100} boosting={state?.boosting ?? false} racing={state?.boostEnabled ?? false} armed={state?.armed ?? false} aiming={state?.aiming ?? false} onStick={(x, y) => engine.current?.joystick(x, y)} onInput={(action, down, source) => engine.current?.input(action, down, source)} onWipers={() => { engine.current?.cycleWipers(); focus(); }} onReload={() => { engine.current?.reloadGun(); focus(); }} onArm={() => { engine.current?.cycleGun(); focus(); }} onCamera={() => { engine.current?.toggleView(); focus(); }} />}
      </>}
      {state?.paused && !mapOpen && !physicsOpen && !menuOpen && <div className="pause-cover"><div><p className="eyebrow">THE CITY CAN WAIT</p><h2>A moment to yourself.</h2><button className="primary-button" onClick={() => { engine.current?.togglePause(); focus(); }}>KEEP EXPLORING <span>→</span></button></div></div>}
      {mapOpen && <WorldMap state={state} raceActive={engine.current?.raceGuidanceActive ?? false} raceTrack={engine.current?.race.track} onClose={() => { toggleMap(); focus(); }} onPlace={id => engine.current?.waypoint(id)} onWaypoint={point => engine.current?.mapWaypoint(point)} />}
      {physicsOpen && !ready && <div className="physics-cover"><div className="physics-sheet" role="dialog" aria-label="Physics checklist"><div className="map-heading"><div><p className="eyebrow">REALISTIC PHYSICS · ONE BY ONE</p><h2>Systems online.</h2></div><button className="control" onClick={() => setPhysicsOpen(false)} aria-label="Close physics">✕</button></div><PhysicsChecklist state={state} /><p className="map-caption">Drive into walls, traffic and crowds to tick crash events. Repair at South Station.</p></div></div>}
      {portrait && !ready && <div className="rotate-cover"><span className="rotate-symbol">↻</span><p className="eyebrow">MORE ROOM TO EXPLORE</p><h2>Turn your world.</h2><p>Rotate your phone to landscape.<br />Your neighborhood will be waiting.</p><button className="primary-button" onClick={enterFullscreen}>GO FULLSCREEN <span>⛶</span></button></div>}
    </section>
    {notice && <div className="notice" role="status">{notice}<button className="control" onClick={() => setNotice('')}>Dismiss</button></div>}
  </main>;
}
