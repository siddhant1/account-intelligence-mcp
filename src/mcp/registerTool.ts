import { performance } from 'node:perf_hooks';
import type { McpServer, ToolCallback } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { hasScope } from '../auth/scopes.js';
import { AppError, ForbiddenError } from '../domain/errors.js';
import type { Logger } from '../logger.js';
import type { ToolContext, ToolDefinition } from './toolDefinition.js';

type Dependencies = Omit<ToolContext, 'signal' | 'logger'> & { logger: Logger };

/**
 * Converts a thrown error into an MCP tool error result. Tool errors (as
 * opposed to JSON-RPC protocol errors) are shown to the model, which lets it
 * correct itself, e.g. by searching for a valid ID after a NOT_FOUND.
 */
export function toToolError(error: unknown): CallToolResult {
  const appError =
    error instanceof AppError ? error : new AppError('INTERNAL', 'An unexpected error occurred. Please try again.');
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ error: appError.toJSON() }) }],
  };
}

export function registerTool(server: McpServer, tool: ToolDefinition, deps: Dependencies): void {
  const handler = async (input: Record<string, unknown>, extra: { requestId: string | number; signal: AbortSignal }) => {
    const logger = deps.logger.child({ tool: tool.name, apiKeyId: deps.principal.apiKeyId, rpcId: extra.requestId });
    const started = performance.now();
    const elapsed = () => Math.round(performance.now() - started);

    try {
      // Tools are only registered for keys holding the scope; this is defence in depth.
      if (!hasScope(deps.principal, tool.scope)) {
        throw new ForbiddenError(`This API key is missing the "${tool.scope}" scope required by ${tool.name}`);
      }
      const output = await tool.execute(input, { ...deps, logger, signal: extra.signal });
      logger.info({ durationMs: elapsed() }, 'tool call succeeded');
      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      } satisfies CallToolResult;
    } catch (error) {
      if (error instanceof AppError) {
        logger.warn({ durationMs: elapsed(), code: error.code, message: error.message }, 'tool call rejected');
      } else {
        logger.error({ durationMs: elapsed(), err: error }, 'tool call failed');
      }
      return toToolError(error);
    }
  };

  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations: { title: tool.title, ...tool.annotations },
    },
    // The SDK validates `input` against `inputSchema` before calling the handler,
    // so the input is already typed; this cast only bridges the generic registry.
    handler as unknown as ToolCallback<typeof tool.inputSchema>,
  );
}
