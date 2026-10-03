import { useCallback, useEffect, useState } from 'react';
import {
  ApiRequestError,
  login as apiLogin,
  me as apiMe,
  checkRoom,
  inviteLink,
  listPublicRooms,
  type PublicRoomEntry,
  type RoomInfo,
  type RoomVisibility,
} from '../api/client';
import { loadSession } from '../api/session';

export type EntryTab = 'solo' | 'host' | 'join';

export interface CreatedServer {
  code: string;
  name: string;
  visibility: RoomVisibility;
}

interface Props {
  name: string;
  onName: (value: string) => void;
  tab: EntryTab;
  onTab: (tab: EntryTab) => void;
  roomCode: string;
  onRoomCode: (value: string) => void;
  entering: boolean;
  enterNote: string;
  created: CreatedServer | null;
  copied: boolean;
  linkCopied: boolean;
  onCopyCode: () => void;
  onCopyLink: () => void;
  onSolo: () => void;
  onCreate: (serverName: string, visibility: RoomVisibility) => void;
  onEnterCreated: () => void;
  onJoin: (code: string) => void;
}

const CODE_PATTERN = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/;

function displayName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

/** Auth token for browsing: reuse the saved session, otherwise sign in with the typed name. */
async function ensureToken(display: string): Promise<string> {
  const saved = loadSession();
  if (saved?.token) {
    try {
      const { player } = await apiMe(saved.token);
      if (player) return saved.token;
    } catch {
      /* Fall through to a fresh login. */
    }
  }
  const { token } = await apiLogin(display);
  return token;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError && error.status === 404) {
    return 'The server is running old code (no browser endpoint). Restart it with `npm run dev` in server/ and refresh this page.';
  }
  return error instanceof Error ? error.message : 'Could not reach the servers. Please try again.';
}

export function EntryScreen(props: Props) {
  const { tab, entering, enterNote } = props;
  const display = displayName(props.name);
  const canAuth = display.length > 0;
  const [serverName, setServerName] = useState('');
  const [visibility, setVisibility] = useState<RoomVisibility>('public');
  const [rooms, setRooms] = useState<PublicRoomEntry[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState('');
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ room: RoomInfo; full: boolean } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  // Creating visibility follows the active tab until the user flips the toggle.
  useEffect(() => {
    if (props.tab === 'host') setVisibility('public');
  }, [props.tab]);

  const fetchRooms = useCallback(async (quiet = false) => {
    if (!canAuth) return;
    if (!quiet) setRoomsLoading(true);
    setRoomsError('');
    try {
      const token = await ensureToken(display);
      const { rooms: listed } = await listPublicRooms(token);
      setRooms(listed);
      setLastChecked(new Date().toLocaleTimeString());
    } catch (error) {
      if (!quiet || rooms.length === 0) {
        setRoomsError(errorMessage(error));
      }
    } finally {
      setRoomsLoading(false);
    }
  }, [tab, display]);

  useEffect(() => {
    if (tab !== 'join' || !canAuth || entering) return;
    setPreview(null);
    void fetchRooms(false);
    const timer = setInterval(() => void fetchRooms(true), 15000);
    return () => clearInterval(timer);
  }, [tab, canAuth, entering, fetchRooms]);
  const findServer = async () => {
    const code = props.roomCode.trim().toUpperCase();
    if (!CODE_PATTERN.test(code) || !canAuth) return;
    setPreviewLoading(true);
    setPreviewError('');
    setPreview(null);
    try {
      const token = await ensureToken(display);
      const { room, full } = await checkRoom(token, code);
      setPreview({ room, full });
    } catch (error) {
      setPreviewError(errorMessage(error));
    } finally {
      setPreviewLoading(false);
    }
  };

  const createDisabled = entering || !canAuth || (serverName.trim().length > 0 &&
    (serverName.trim().length < 3 || serverName.trim().length > 32));
  const joinDisabled = entering || !canAuth || !CODE_PATTERN.test(props.roomCode.trim().toUpperCase());

  return (
    <div className="world-intro">
      <div className="intro-card" role="form" aria-label="Enter the district">
        <p className="eyebrow">THE FIRST BLOCK OF SOMETHING BIGGER</p>
        <h1>OUTSIDE.<br />IS YOURS.</h1>
        <p className="intro-sub">A living little district, built from simple things.<br />Walk its streets. Meet its rhythm. Find your place.</p>

        <div className="mode-tabs" role="tablist" aria-label="Play mode">
          {(['solo', 'host', 'join'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              className={tab === t ? 'on' : ''}
              disabled={entering}
              onClick={() => props.onTab(t)}
            >
              {t === 'solo' ? 'SOLO' : t === 'host' ? 'HOST' : 'JOIN'}
            </button>
          ))}
        </div>

        <label className="name-row">
          <span>YOUR NAME</span>
          <input
            value={props.name}
            maxLength={24}
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. Ava"
            aria-label="Your display name"
            disabled={entering}
            onChange={(event) => props.onName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              if (tab === 'solo') props.onSolo();
              else if (tab === 'join') props.onJoin(props.roomCode);
            }}
          />
        </label>

        {tab === 'solo' && (
          <>
            <button className="primary-button" disabled={entering || !canAuth} onClick={props.onSolo}>
              {entering ? 'PLEASE WAIT...' : 'EXPLORE DISTRICT'} <span>↗</span>
            </button>
          </>
        )}

        {tab === 'host' && (
          <>
            <div className="seg visibility-toggle" role="radiogroup" aria-label="New server visibility">
              {(['public', 'private'] as const).map((v) => (
                <button
                  key={v}
                  role="radio"
                  aria-checked={visibility === v}
                  className={visibility === v ? 'on' : ''}
                  disabled={entering}
                  onClick={() => setVisibility(v)}
                >
                  {v === 'public' ? '🌐 PUBLIC' : '🔒 PRIVATE'}
                </button>
              ))}
            </div>
            <label className="name-row">
              <span>SERVER NAME</span>
              <input
                value={serverName}
                maxLength={32}
                autoComplete="off"
                spellCheck={false}
                placeholder="e.g. Sunset Courts"
                aria-label="New server name"
                disabled={entering}
                onChange={(event) => setServerName(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Enter') props.onCreate(serverName.trim(), visibility); }}
              />
            </label>
            <button
              className="primary-button"
              disabled={createDisabled}
              onClick={() => props.onCreate(serverName.trim(), visibility)}
            >
              {entering ? 'PLEASE WAIT...' : visibility === 'public' ? 'HOST PUBLIC SERVER' : 'HOST PRIVATE SERVER'} <span>↗</span>
            </button>
            <p className="form-note">Public servers appear in the JOIN list. Private servers need the code or invite link.</p>
          </>
        )}

        {tab === 'join' && (
          <>
            <label className="name-row">
              <span>SERVER CODE</span>
              <input
                value={props.roomCode}
                maxLength={12}
                autoComplete="off"
                spellCheck={false}
                placeholder="K7Q2MD"
                aria-label="Server code"
                disabled={entering}
                style={{ textTransform: 'uppercase' }}
                onChange={(event) => {
                  props.onRoomCode(event.target.value.toUpperCase().replace(/[\s-]+/g, '').slice(0, 6));
                  setPreview(null);
                  setPreviewError('');
                }}
                onKeyDown={(event) => { if (event.key === 'Enter') void findServer(); }}
              />
            </label>
            <div className="button-row">
              <button className="control" disabled={joinDisabled || previewLoading} onClick={() => void findServer()}>
                {previewLoading ? 'FINDING...' : 'FIND SERVER'}
              </button>
              <button className="primary-button inline" disabled={joinDisabled} onClick={() => props.onJoin(props.roomCode)}>
                {entering ? 'PLEASE WAIT...' : 'JOIN WORLD'} <span>↗</span>
              </button>
            </div>
            {previewError && <p className="form-note" role="alert">{previewError}</p>}
            {preview && (
              <div className="server-preview" role="status">
                <div>
                  <b>{preview.room.name ?? preview.room.code}</b>
                  <small>host {preview.room.host_name ?? 'unknown'} · {preview.room.code} · {preview.room.member_count}/{preview.room.max_members}</small>
                </div>
                <i>{preview.full ? 'FULL' : preview.room.visibility === 'public' ? '🌐 PUBLIC' : '🔒 PRIVATE'}</i>
              </div>
            )}
            <div className="browser-head">
              <span className="eyebrow">OR PICK A PUBLIC SERVER · {rooms.length}{lastChecked ? ` · ${lastChecked}` : ''}</span>
              <button className="control" disabled={entering || roomsLoading || !canAuth} onClick={() => void fetchRooms(false)}>
                {roomsLoading ? '...' : '⟳ REFRESH'}
              </button>
            </div>
            {!canAuth && <p className="form-note">Enter your name above to browse live servers.</p>}
            {roomsError && <p className="form-note" role="alert">{roomsError}</p>}
            {canAuth && !roomsError && rooms.length === 0 && !roomsLoading && (
              <p className="form-note">{lastChecked
                ? `Checked at ${lastChecked}: no public servers saved in the database. Host one from the HOST tab, then press refresh.`
                : 'No public servers right now — host one from the HOST tab.'}</p>
            )}
            <ul className="server-list" aria-label="Public servers">
              {rooms.map((room) => (
                <li key={room.code} className="server-row">
                  <div className="server-row-main">
                    <b>{room.name ?? room.code}</b>
                    <small>host {room.host_name ?? 'unknown'} · {room.code} · {room.member_count}/{room.max_members}</small>
                  </div>
                  <div className="server-row-meter" aria-hidden="true">
                    <i style={{ width: `${Math.min(100, Math.round((room.member_count / Math.max(1, room.max_members)) * 100))}%` }} />
                  </div>
                  <button
                    className="control"
                    disabled={entering || room.member_count >= room.max_members}
                    onClick={() => props.onJoin(room.code)}
                  >
                    {room.member_count >= room.max_members ? 'FULL' : 'JOIN'}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {props.created && (
          <div className="room-code-panel" role="status">
            <span>{props.created.visibility === 'public' ? '🌐 LIVE — SHARE THIS CODE' : '🔒 SHARE THIS CODE'}</span>
            <b>{props.created.code}</b>
            <small className="code-sub">{props.created.name}</small>
            <div className="button-row">
              <button className="control" onClick={props.onCopyCode}>{props.copied ? 'COPIED ✓' : 'COPY CODE'}</button>
              <button className="control" onClick={props.onCopyLink}>{props.linkCopied ? 'LINK COPIED ✓' : 'COPY INVITE LINK'}</button>
            </div>
            <small className="code-sub break">{inviteLink(props.created.code)}</small>
            <button className="primary-button" disabled={entering} onClick={props.onEnterCreated}>
              {entering ? 'PLEASE WAIT...' : 'ENTER WORLD'} <span>↗</span>
            </button>
          </div>
        )}

        {tab !== 'solo' && <p className="form-note">Use a different player name for each person joining.</p>}
        {enterNote && <p className="form-note" role="status">{enterNote}</p>}
        <div className="intro-tags"><span>7 LOCATIONS</span><span>2 PERSPECTIVES</span><span>NO RUSH</span></div>
      </div>
    </div>
  );
}
