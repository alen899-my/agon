import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { pool } from './db/pool.js';
import { attachRealtime } from './realtime/server.js';
import { pruneExpiredRooms } from './services/rooms.service.js';

async function main(): Promise<void> {
  await migrate();
  const pruned = await pruneExpiredRooms().catch((error) => {
    console.error('[api] room prune failed', error);
    return 0;
  });
  if (pruned > 0) console.log(`[api] pruned ${pruned} expired room(s)`);
  const janitor = setInterval(() => {
    void pruneExpiredRooms()
      .then((count) => {
        if (count > 0) console.log(`[api] pruned ${count} expired room(s)`);
      })
      .catch((error) => console.error('[api] room prune failed', error));
  }, 3_600_000);
  janitor.unref?.();

  const app = createApp();
  const server = createServer(app);
  attachRealtime(server);
  server.listen(config.PORT, () => {
    console.log(`[api] listening on :${config.PORT} (${config.NODE_ENV})`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[api] ${signal} — draining`);
    clearInterval(janitor);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch(async (error) => {
  console.error('[api] failed to boot', error);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
