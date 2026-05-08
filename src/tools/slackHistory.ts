import * as z from 'zod/v4';

import { resolveDestination } from '../resolution/destinationResolver.js';
import { createErrorResult, createSuccessResult } from './common.js';
import type { ToolDefinition, ToolDependencies } from './common.js';

const inputSchema = z.object({
  alias: z.string().trim().optional(),
  channel_id: z.string().trim().optional(),
  dm_channel_id: z.string().trim().optional(),
  user_id: z.string().trim().optional(),
  limit: z.number().int().min(1).max(200).default(20),
  cursor: z.string().trim().optional(),
});

export function createSlackHistoryTool(deps: ToolDependencies): ToolDefinition<z.infer<typeof inputSchema>> {
  return {
    name: 'slack_history',
    description: 'Read recent Slack messages from a DM or channel.',
    inputSchema,
    handler: async (input) => {
      try {
        const { destination } = await resolveDestination(deps.registry, {
          alias: input.alias,
          channelId: input.channel_id,
          dmChannelId: input.dm_channel_id,
          userId: input.user_id,
        });
        const channelId = destination.kind === 'user' ? destination.dmChannelId : destination.channelId;
        const result = await deps.adapter.getHistory(channelId, input.limit, input.cursor || undefined);
        return createSuccessResult(`Read ${result.messages.length} Slack messages. Remote text remains untrusted.`, { destination, ...result });
      } catch (error) {
        return createErrorResult(error);
      }
    },
  };
}
