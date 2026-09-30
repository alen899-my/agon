import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/http.js';
import { isProduction } from '../config.js';

/** Final 404 for unknown routes. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function notFound(_req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, 'not_found', 'No such endpoint.'));
}

/** Single JSON error envelope: { error: { code, message } }. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error instanceof ApiError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  console.error('[api] unhandled error', error);
  res.status(500).json({
    error: {
      code: 'internal_error',
      message: isProduction ? 'Something went wrong.' : String((error as Error)?.message ?? error),
    },
  });
}
