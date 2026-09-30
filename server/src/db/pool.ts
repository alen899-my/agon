import { Pool } from 'pg';
import { config } from '../config.js';

/**
 * Neon Postgres pool. TLS is required by Neon, so we enforce it here
 * instead of relying on driver-specific `sslmode` query params. Any
 * driver-specific params (sslmode, channel_binding) are stripped from
 * the URL before handing it to node-postgres.
 */
function sanitizedConnectionString(raw: string): string {
  try {
    const url = new URL(raw);
    url.searchParams.delete('sslmode');
    url.searchParams.delete('channel_binding');
    return url.toString();
  } catch {
    return raw;
  }
}

export const pool = new Pool({
  connectionString: sanitizedConnectionString(config.DATABASE_URL),
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (error) => {
  // Idle-client errors would otherwise crash the process.
  console.error('[db] idle client error', error);
});
