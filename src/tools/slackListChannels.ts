import * as z from 'zod/v4';

import { createErrorResult, createSuccessResult } from './common.js';
import type { ToolDefinition, ToolDependencies } from './common.js';

const inputSchema = z.object({
  types: z.array(z.enum(['public_channel', 'private_channel', 'mpim', 'im'])).default(['public_channel', 'private_channel', 'im', 'mpim']),
  limit: z.number().int().min(1).max(200).default(100),
  cursor: z.string().trim().min(1).optional(),
});

export function createSlackListChannelsTool(deps: ToolDependencies): ToolDefinition<z.infer<typeof inputSchema>> {
  return {
    name: 'slack_list_channels',
    description: 'List Slack channels and direct conversations.',
    inputSchema,
    handler: async (input) => {
      try {
        const result = await deps.adapter.listChannels(input);
        return createSuccessResult(`Listed ${result.channels.length} Slack conversations.`, result);
      } catch (error) {
        return createErrorResult(error);
      }
    },
  };
}
