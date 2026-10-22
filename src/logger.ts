import pino, { type Logger } from 'pino';
import type { AppConfig } from './config.js';

export type { Logger };

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

  if (config.log.pretty) {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: { destination: 2, colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname,service' },
      },
    });
  }
  return pino(options, pino.destination(2));
}
