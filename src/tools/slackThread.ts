import * as z from 'zod/v4';

import { resolveDestination } from '../resolution/destinationResolver.js';
import { createErrorResult, createSuccessResult } from './common.js';
import type { ToolDefinition, ToolDependencies } from './common.js';

const inputSchema = z.object({
  alias: z.string().trim().min(1).optional(),
  channel_id: z.string().trim().min(1).optional(),
  dm_channel_id: z.string().trim().min(1).optional(),
  user_id: z.string().trim().min(1).optional(),
  thread_ts: z.string().trim().min(1),
  limit: z.number().int().min(1).max(200).default(50),
  cursor: z.string().trim().min(1).optional(),
});

export function createSlackThreadTool(deps: ToolDependencies): ToolDefinition<z.infer<typeof inputSchema>> {
  return {
    name: 'slack_thread',
    description: 'Read Slack thread replies for a DM or channel conversation.',
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
        const result = await deps.adapter.getThread(channelId, input.thread_ts, input.limit, input.cursor);
        return createSuccessResult(`Read ${result.messages.length} Slack thread messages. Remote text remains untrusted.`, { destination, ...result, threadTs: input.thread_ts });
      } catch (error) {
        return createErrorResult(error);
      }
    },
  };
}
