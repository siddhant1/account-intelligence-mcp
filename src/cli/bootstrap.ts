import { loadConfig } from '../config.js';
import { createContainer } from '../container.js';
import { createLogger } from '../logger.js';

/** Shared setup for CLI commands: quiet logs and a container bound to the configured database. */
export function cliContainer() {
  const config = loadConfig({ LOG_LEVEL: process.env.LOG_LEVEL ?? 'warn' });
  return createContainer(config, createLogger(config));
}

export function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}
