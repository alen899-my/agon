import { defineConfig } from 'vitest/config';

// Web-app unit tests only. The API has its own suite: `npm test --prefix server`
// (it needs server/.env with DATABASE_URL + JWT_SECRET).
export default defineConfig({
  test: {
    include: ['src/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
  },
});
