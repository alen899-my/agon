import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../config.js', () => ({ config: { AI_MODE: 'llm', OPENROUTER_API_KEY: 'test', OPENROUTER_MODEL: 'test' } }));
vi.mock('../middleware/auth.js', () => ({ requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.header('authorization')) { res.status(401).json({ error: 'unauthorized' }); return; }
  req.player = { id: req.header('authorization')!, name: 'Test' }; next();
} }));
const generate = vi.hoisted(() => vi.fn(async () => ['Model opening.', 'Model response.']));
vi.mock('../agents/dialogue.js', () => ({ DialogueBrain: class { generate = generate; } }));
import { dialogueRouter } from './dialogue.routes.js';
const app = express(); app.use(express.json()); app.use('/api/dialogue', dialogueRouter);
const context = { participants: [{ id: 'a', name: 'A', role: 'vendor' }, { id: 'b', name: 'B', role: 'resident' }], situation: 'At the market.', history: [] };
afterEach(() => vi.clearAllMocks());
describe('dialogue endpoint', () => {
  it('requires authentication and validates context before model access', async () => {
    expect((await request(app).post('/api/dialogue').send(context)).status).toBe(401);
    expect((await request(app).post('/api/dialogue').set('Authorization', 'invalid-body').send({ ...context, situation: 'x'.repeat(2001) })).status).toBe(400);
    expect(generate).not.toHaveBeenCalled();
  });
  it('returns model turns and limits repeated requests by the same player', async () => {
    const response = await request(app).post('/api/dialogue').set('Authorization', 'test-player').send(context);
    expect(response.body.lines).toEqual(['Model opening.', 'Model response.']);
    expect((await request(app).post('/api/dialogue').set('Authorization', 'test-player').send(context)).status).toBe(429);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
