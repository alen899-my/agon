import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  CLIENT_URL: z
    .string()
    .min(1, 'CLIENT_URL is required')
    .transform((raw, ctx) => {
      const items = raw
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
      const origins: string[] = [];
      for (const item of items) {
        try {
          origins.push(new URL(item).origin);
        } catch {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: `bad origin: ${item}` });
          return z.NEVER;
        }
      }
      if (origins.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'at least one origin required' });
        return z.NEVER;
      }
      return [...new Set(origins)];
    }),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_EXPIRES_IN: z.string().default('30d'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export type AppConfig = z.infer<typeof schema>;

function loadConfig(): AppConfig {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid server configuration — ${details}`);
  }
  return parsed.data;
}

export const config = loadConfig();
export const isProduction = config.NODE_ENV === 'production';
