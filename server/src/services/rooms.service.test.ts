import { describe, expect, it } from 'vitest';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  generateRoomCode,
  normalizeRoomCode,
} from './rooms.service.js';
import { ApiError } from '../utils/http.js';

describe('room codes', () => {
  it('generates 6-char codes from the unambiguous alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(ROOM_CODE_LENGTH);
      for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
    }
  });
  it('generates unique codes at room scale', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(generateRoomCode());
    expect(seen.size).toBeGreaterThan(1990);
  });
  it('normalizes case, spaces and dashes', () => {
    expect(normalizeRoomCode(' k7q-2md ')).toBe('K7Q2MD');
  });
  it('rejects malformed codes with a 400 envelope code', () => {
    for (const bad of ['', 'ABC', 'ABCDEFG', 'K7Q2M!', 'AAAAAA'.replaceAll('A', '0'), 123, null]) {
      try {
        normalizeRoomCode(bad);
        expect.unreachable(`accepted ${JSON.stringify(bad)}`);
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).status).toBe(400);
      }
    }
  });
});
