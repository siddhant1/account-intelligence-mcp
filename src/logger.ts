import { createRequire } from 'node:module';
import pino, { type Logger } from 'pino';
import type { AppConfig } from './config.js';

export type { Logger };

/** pino-pretty is a dev dependency; production installs (`npm ci --omit=dev`) do not have it. */
function prettyPrinterInstalled(): boolean {
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

/**
 * Structured JSON logger. Always writes to stderr: with the stdio transport,
 * stdout carries the MCP protocol stream and must never receive log lines.
 */
export function createLogger(config: Pick<AppConfig, 'log'>): Logger {
  const options: pino.LoggerOptions = {
    level: config.log.level,
    base: { service: 'account-intelligence-mcp' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: ['req.headers.authorization', 'req.headers["x-api-key"]', '*.apiKey', '*.token'],
      censor: '[redacted]',
    },
  };

  const pretty = config.log.pretty && prettyPrinterInstalled();
  const logger = pretty
    ? pino({
        ...options,
        transport: {
          target: 'pino-pretty',
          options: { destination: 2, colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname,service' },
        },
      })
    : pino(options, pino.destination(2));

  if (config.log.pretty && !pretty) logger.warn('LOG_PRETTY is set but pino-pretty is not installed; logging JSON');
  return logger;
}
