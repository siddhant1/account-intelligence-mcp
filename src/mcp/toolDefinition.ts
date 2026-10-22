import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';
import type { Principal, Scope } from '../auth/scopes.js';
import type { Services } from '../container.js';
import type { Logger } from '../logger.js';

export interface ToolContext {
  services: Services;
  principal: Principal;
  logger: Logger;
  /** Aborted when the client cancels the request or disconnects. */
  signal: AbortSignal;
}

/**
 * A transport-agnostic tool: schemas, metadata, the scope it requires and a
 * typed `execute` function. Registration (auth, logging, error mapping and
 * result formatting) is handled once in `registerTool`.
 */
export interface ToolDefinition<I extends z.ZodRawShape = z.ZodRawShape, O extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  scope: Scope;
  inputSchema: I;
  outputSchema: O;
  annotations: ToolAnnotations;
  execute(input: z.output<z.ZodObject<I>>, context: ToolContext): Promise<z.output<z.ZodObject<O>>> | z.output<z.ZodObject<O>>;
}

export const defineTool = <I extends z.ZodRawShape, O extends z.ZodRawShape>(definition: ToolDefinition<I, O>) =>
  definition;
