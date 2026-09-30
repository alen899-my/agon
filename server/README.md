# Agon API

Express + TypeScript + Postgres (Neon) backend for the open-district game.
Auth is intentionally minimal: **display name only** — first use creates the
player, returning names sign back in.

## Layout

```
server/
  src/
    index.ts            # boot: migrate → listen → graceful shutdown
    app.ts              # express app factory (middleware + routes)
    config.ts           # validated env (zod, fail-fast)
    db/
      pool.ts           # pg Pool, Neon TLS enforced
      schema.sql        # players table
      migrate.ts        # applies schema.sql (idempotent)
    routes/             # thin route wiring only
    controllers/        # request/response handling
    services/           # business logic + db access
    middleware/         # requireAuth (JWT), 404 + JSON error envelope
    utils/              # ApiError, asyncHandler
```

## Setup

```bash
cd server
cp .env.example .env   # fill DATABASE_URL + JWT_SECRET
npm install
npm run migrate        # optional — index.ts migrates on boot too
npm run dev            # tsx watch on :4000
```

## Endpoints

| Method | Path              | Auth | Body / Notes                          |
| ------ | ----------------- | ---- | ------------------------------------- |
| GET    | `/health`         | no   | `{ status, db }`                      |
| POST   | `/api/auth/login` | no   | `{ "name": "Ava" }` → `{ token, player }` |
| GET    | `/api/auth/me`    | yes  | current player                        |
| GET    | `/api/players/:id`| yes  | public profile                        |

Auth header: `Authorization: Bearer <jwt>`.
Errors: `{ "error": { "code": "invalid_name", "message": "..." } }`.

## Frontend wiring

Set `VITE_API_URL=http://localhost:4000` (or leave the default) and the game
logs in with the intro-screen name, storing the JWT in `localStorage`.
