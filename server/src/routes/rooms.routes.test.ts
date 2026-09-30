import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { pool } from '../db/pool.js';
import { migrate } from '../db/migrate.js';

const app = createApp();
const tag = `T${Date.now().toString(36)}`;
const names = [`${tag}Host`, `${tag}Guest`, `${tag}Third`];
const tokens: string[] = [];
let roomCode = '';

async function loginAs(name: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ name });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

describe('rooms API', () => {
  beforeAll(async () => {
    await migrate();
    for (const name of names) tokens.push(await loginAs(name));
  }, 60_000);

  afterAll(async () => {
    await pool.query('DELETE FROM rooms WHERE code = $1', [roomCode]).catch(() => undefined);
    await pool.query('DELETE FROM players WHERE name = ANY($1)', [names]).catch(() => undefined);
    await pool.end();
  });

  it('creates a room and returns a valid invite code', async () => {
    const res = await request(app).post('/api/rooms').set('Authorization', `Bearer ${tokens[0]}`);
    expect(res.status).toBe(201);
    roomCode = res.body.room.code as string;
    expect(roomCode).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(res.body.room.member_count).toBe(1);
    expect(res.body.room.max_members).toBe(100);
  });

  it('live-checks a code without leaking the roster', async () => {
    const res = await request(app).get(`/api/rooms/${roomCode}`).set('Authorization', `Bearer ${tokens[1]}`);
    expect(res.status).toBe(200);
    expect(res.body.room.code).toBe(roomCode);
    expect(res.body).not.toHaveProperty('roster');
  });

  it('joins by code and is idempotent on rejoin', async () => {
    const first = await request(app).post('/api/rooms/join').set('Authorization', `Bearer ${tokens[1]}`).send({ code: roomCode.toLowerCase() });
    expect(first.status).toBe(200);
    expect(first.body.roster).toHaveLength(2);
    const second = await request(app).post('/api/rooms/join').set('Authorization', `Bearer ${tokens[1]}`).send({ code: roomCode });
    expect(second.status).toBe(200);
    expect(second.body.roster).toHaveLength(2);
  });

  it('rejects unknown codes, malformed codes and strangers', async () => {
    const missing = await request(app).post('/api/rooms/join').set('Authorization', `Bearer ${tokens[2]}`).send({ code: 'ZZZZZZ' });
    expect(missing.status).toBe(404);
    const malformed = await request(app).post('/api/rooms/join').set('Authorization', `Bearer ${tokens[2]}`).send({ code: 'nope' });
    expect(malformed.status).toBe(400);
    const anon = await request(app).post('/api/rooms/join').send({ code: roomCode });
    expect(anon.status).toBe(401);
  });

  it('enforces the member cap', async () => {
    await pool.query('UPDATE rooms SET max_members = 2 WHERE code = $1', [roomCode]);
    const res = await request(app).post('/api/rooms/join').set('Authorization', `Bearer ${tokens[2]}`).send({ code: roomCode });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('room_full');
    await pool.query('UPDATE rooms SET max_members = 100 WHERE code = $1', [roomCode]);
  });

  it('leaves, migrates host, and deletes the room when empty', async () => {
    const leaveGuest = await request(app).post('/api/rooms/leave').set('Authorization', `Bearer ${tokens[1]}`).send({ code: roomCode });
    expect(leaveGuest.status).toBe(200);
    // Host leaves: guest rejoins first so migration has a target.
    await request(app).post('/api/rooms/join').set('Authorization', `Bearer ${tokens[1]}`).send({ code: roomCode });
    await request(app).post('/api/rooms/leave').set('Authorization', `Bearer ${tokens[0]}`).send({ code: roomCode });
    const { rows } = await pool.query('SELECT host_player_id FROM rooms WHERE code = $1', [roomCode]);
    expect(rows).toHaveLength(1);
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${tokens[1]}`);
    expect(rows[0].host_player_id).toBe(me.body.player.id);
    await request(app).post('/api/rooms/leave').set('Authorization', `Bearer ${tokens[1]}`).send({ code: roomCode });
    const gone = await request(app).get(`/api/rooms/${roomCode}`).set('Authorization', `Bearer ${tokens[0]}`);
    expect(gone.status).toBe(404);
  });
});
