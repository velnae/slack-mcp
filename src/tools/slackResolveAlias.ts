import * as z from 'zod/v4';

import { SlackMcpError } from '../errors.js';
import { createErrorResult, createSuccessResult } from './common.js';
import type { ToolDefinition, ToolDependencies } from './common.js';

const inputSchema = z.object({
  alias: z.string().trim().min(1),
});

export function createSlackResolveAliasTool(deps: ToolDependencies): ToolDefinition<z.infer<typeof inputSchema>> {
  return {
    name: 'slack_resolve_alias',
    description: 'Resolve a local Slack alias to a DM or channel destination.',
    inputSchema,
    handler: async (input) => {
      try {
        const destination = await deps.registry.resolve(input.alias);
        if (!destination) {
          throw new SlackMcpError('NOT_FOUND', `Alias '${input.alias}' was not found.`, {
            hint: 'Create it with slack_alias_upsert or provide an explicit conversation ID to write tools.',
          });
        }

        return createSuccessResult(`Resolved alias '${input.alias}'.`, destination);
      } catch (error) {
        return createErrorResult(error);
      }
    },
  };
}
