import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface TokenPayload {
  sub: string;
  name: string;
}

export function signToken(playerId: string, name: string): string {
  return jwt.sign({ name } satisfies Omit<TokenPayload, 'sub'>, config.JWT_SECRET, {
    subject: playerId,
    expiresIn: config.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, config.JWT_SECRET);
  if (typeof decoded === 'string' || !decoded.sub || typeof decoded.name !== 'string') {
    throw new jwt.JsonWebTokenError('Malformed token payload');
  }
  return { sub: decoded.sub, name: decoded.name };
}
