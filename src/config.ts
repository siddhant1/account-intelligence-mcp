import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * Project root, derived from this file's location so paths resolve correctly
 * no matter which directory the process was started from. MCP clients such as
 * Claude Desktop spawn stdio servers with an arbitrary working directory.
 */
export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const DEV_EXPORT_SECRET = 'dev-only-export-signing-secret-change-me';

const booleanFromString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent']).default('info'),
    LOG_PRETTY: booleanFromString.optional(),

    HOST: z.string().min(1).default('127.0.0.1'),
    PORT: z.coerce.number().int().min(0).max(65535).default(3100),
    PUBLIC_BASE_URL: z.url().optional(),
    ALLOWED_HOSTS: z.string().default('localhost,127.0.0.1,[::1]'),
    TRUST_PROXY: booleanFromString.default(false),

    DATABASE_PATH: z.string().min(1).default('./data/account-intel.db'),

    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
    AUTH_FAILURE_LIMIT: z.coerce.number().int().positive().default(20),

    EXPORT_URL_TTL_SECONDS: z.coerce.number().int().positive().max(7 * 24 * 3600).default(900),
    EXPORT_SIGNING_SECRET: z.string().min(16).default(DEV_EXPORT_SECRET),

    ENRICHMENT_LATENCY_MS: z.coerce.number().int().min(0).default(150),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && (env.EXPORT_SIGNING_SECRET === DEV_EXPORT_SECRET || env.EXPORT_SIGNING_SECRET.length < 32)) {
      ctx.addIssue({
        code: 'custom',
        path: ['EXPORT_SIGNING_SECRET'],
        message: 'must be set to a random value of at least 32 characters in production',
      });
    }
  });

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  log: { level: string; pretty: boolean };
  http: {
    host: string;
    port: number;
    publicBaseUrl: string;
    allowedHosts: string[];
    trustProxy: boolean;
  };
  databasePath: string;
  rateLimit: { windowMs: number; max: number; authFailureLimit: number };
  exports: { urlTtlSeconds: number; signingSecret: string };
  enrichment: { latencyMs: number };
}

/** Loads `.env` from the project root (if present) without overriding real environment variables. */
function loadDotEnv(): void {
  const file = path.join(PROJECT_ROOT, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

export function loadConfig(overrides: Record<string, string | undefined> = {}): AppConfig {
  if (process.env.NODE_ENV !== 'test') loadDotEnv();

  const parsed = envSchema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${details}`);
  }
  const env = parsed.data;

  const databasePath =
    env.DATABASE_PATH === ':memory:' ? env.DATABASE_PATH : path.resolve(PROJECT_ROOT, env.DATABASE_PATH);

  return {
    env: env.NODE_ENV,
    log: { level: env.LOG_LEVEL, pretty: env.LOG_PRETTY ?? env.NODE_ENV === 'development' },
    http: {
      host: env.HOST,
      port: env.PORT,
      publicBaseUrl: (env.PUBLIC_BASE_URL ?? `http://localhost:${env.PORT}`).replace(/\/+$/, ''),
      allowedHosts: env.ALLOWED_HOSTS.split(',').map((host) => host.trim()).filter(Boolean),
      trustProxy: env.TRUST_PROXY,
    },
    databasePath,
    rateLimit: {
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
      authFailureLimit: env.AUTH_FAILURE_LIMIT,
    },
    exports: { urlTtlSeconds: env.EXPORT_URL_TTL_SECONDS, signingSecret: env.EXPORT_SIGNING_SECRET },
    enrichment: { latencyMs: env.ENRICHMENT_LATENCY_MS },
  };
}
