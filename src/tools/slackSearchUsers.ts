import * as z from 'zod/v4';

import { createErrorResult, createSuccessResult } from './common.js';
import type { ToolDefinition, ToolDependencies } from './common.js';

const inputSchema = z.object({
  query: z.string().trim().min(1),
  limit: z.number().int().min(1).max(50).default(10),
});

export function createSlackSearchUsersTool(deps: ToolDependencies): ToolDefinition<z.infer<typeof inputSchema>> {
  return {
    name: 'slack_search_users',
    description: 'Search Slack users by name or email.',
    inputSchema,
    handler: async (input) => {
      try {
        const result = await deps.adapter.searchUsers(input);
        return createSuccessResult(`Found ${result.users.length} Slack users for '${input.query}'.`, result);
      } catch (error) {
        return createErrorResult(error);
      }
    },
  };
}
