import * as z from 'zod/v4';

import { createErrorResult, createSuccessResult } from './common.js';
import type { ToolDefinition, ToolDependencies } from './common.js';

const inputSchema = z
  .object({
    alias: z.string().trim().min(1),
    kind: z.enum(['user', 'channel']),
    overwrite: z.boolean().default(false),
    user_id: z.string().trim().min(1).optional(),
    dm_channel_id: z.string().trim().min(1).optional(),
    real_name: z.string().trim().min(1).optional(),
    email: z.string().trim().email().optional(),
    channel_id: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.kind === 'user' && (!value.user_id || !value.dm_channel_id)) {
      ctx.addIssue({ code: 'custom', message: 'user_id and dm_channel_id are required for user aliases.', path: ['user_id'] });
    }
    if (value.kind === 'channel' && !value.channel_id) {
      ctx.addIssue({ code: 'custom', message: 'channel_id is required for channel aliases.', path: ['channel_id'] });
    }
  });

export function createSlackAliasUpsertTool(deps: ToolDependencies): ToolDefinition<z.infer<typeof inputSchema>> {
  return {
    name: 'slack_alias_upsert',
    description: 'Create or update a local Slack alias without silent overwrite.',
    inputSchema,
    handler: async (input) => {
      try {
        if (input.kind === 'user') {
          const result = await deps.registry.upsertUser(
            input.alias,
            {
              user_id: input.user_id!,
              dm_channel_id: input.dm_channel_id!,
              real_name: input.real_name,
              email: input.email,
            },
            input.overwrite,
          );
          return createSuccessResult(`Saved user alias '${result.alias}'.`, { kind: 'user', alias: result.alias, created: result.created });
        }

        const result = await deps.registry.upsertChannel(
          input.alias,
          input.name ? { channel_id: input.channel_id!, name: input.name } : input.channel_id!,
          input.overwrite,
        );
        return createSuccessResult(`Saved channel alias '${result.alias}'.`, { kind: 'channel', alias: result.alias, created: result.created });
      } catch (error) {
        return createErrorResult(error);
      }
    },
  };
}
