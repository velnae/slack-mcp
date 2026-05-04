import type { CallToolResult } from '@modelcontextprotocol/server';

import { toToolError } from '../errors.js';
import type { AliasRegistry } from '../aliases/AliasRegistry.js';
import type { AppConfig } from '../config.js';
import type { DuplicateGuard } from '../safety/duplicateGuard.js';
import type { SlackAdapter } from '../slack/SlackAdapter.js';
import type { ToolFailureShape, ToolSuccessShape } from '../types.js';

export interface ToolDependencies {
  config: AppConfig;
  registry: AliasRegistry;
  adapter: SlackAdapter;
  duplicateGuard: DuplicateGuard;
}

export interface ToolDefinition<TInput> {
  name: string;
  description: string;
  inputSchema: unknown;
  handler: (input: TInput) => Promise<CallToolResult>;
}

export function createSuccessResult<TData>(summary: string, data: TData): CallToolResult {
  const structuredContent: ToolSuccessShape<TData> = {
    ok: true,
    data,
  };

  return {
    content: [{ type: 'text', text: summary }],
    structuredContent: structuredContent as unknown as Record<string, unknown>,
  };
}

export function createErrorResult(error: unknown): CallToolResult {
  const toolError = toToolError(error);
  const structuredContent: ToolFailureShape = {
    ok: false,
    error: toolError,
  };

  return {
    isError: true,
    content: [{ type: 'text', text: `${toolError.code}: ${toolError.message}` }],
    structuredContent: structuredContent as unknown as Record<string, unknown>,
  };
}
