import * as z from 'zod/v4';

import { SlackMcpError } from '../errors.js';
import { resolveDestination } from '../resolution/destinationResolver.js';
import { enforceAllowlist, destinationConversationId } from '../safety/allowlist.js';
import { createDryRunData } from '../safety/dryRun.js';
import { createErrorResult, createSuccessResult } from './common.js';
import type { ToolDefinition, ToolDependencies } from './common.js';

const inputSchema = z.object({
  alias: z.string().trim().min(1).optional(),
  channel_id: z.string().trim().min(1).optional(),
  dm_channel_id: z.string().trim().min(1).optional(),
  user_id: z.string().trim().min(1).optional(),
  text: z.string().trim().min(1),
  thread_ts: z.string().trim().min(1).optional(),
});

export function createSlackSendMessageTool(deps: ToolDependencies): ToolDefinition<z.infer<typeof inputSchema>> {
  return {
    name: 'slack_send_message',
    description: 'Send a Slack message to a resolved DM, channel, or thread.',
    inputSchema,
    handler: async (input) => {
      let dedupeKey: string | undefined;
      let destinationId: string | undefined;
      try {
        const { destination } = await resolveDestination(deps.registry, {
          alias: input.alias,
          channelId: input.channel_id,
          dmChannelId: input.dm_channel_id,
          userId: input.user_id,
        });

        enforceAllowlist(destination, deps.config.allowedConversations);

        destinationId = destinationConversationId(destination);
        dedupeKey = `send:${destinationId}:${input.thread_ts ?? 'root'}:${input.text}`;
        deps.duplicateGuard.assertNotDuplicate(dedupeKey);

        if (deps.config.dryRun) {
          return createSuccessResult('Dry-run: Slack message not sent.', createDryRunData('send_message', destination, { text: input.text, thread_ts: input.thread_ts }).data);
        }

        const channelId = destination.kind === 'user' ? destination.dmChannelId : destination.channelId;
        const result = await deps.adapter.sendMessage({ channelId, text: input.text, threadTs: input.thread_ts });
        deps.duplicateGuard.clear(dedupeKey);
        return createSuccessResult(`Sent Slack message to ${channelId}.`, { destination, ...result });
      } catch (error) {
        if (error instanceof SlackMcpError && error.uncertainWrite && dedupeKey && destinationId) {
          deps.duplicateGuard.remember({
            key: dedupeKey,
            destinationId,
            summary: input.text,
            createdAt: Date.now(),
            reason: error.message,
          });
        }
        return createErrorResult(error);
      }
    },
  };
}
