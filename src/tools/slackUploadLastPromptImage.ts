import * as z from 'zod/v4';

import { readPromptImageManifest } from '../opencode/promptImageManifest.js';
import { createErrorResult, createSuccessResult } from './common.js';
import type { ToolDefinition, ToolDependencies } from './common.js';
import { executeSlackUploadFile } from './slackUploadFile.js';

export const slackUploadLastPromptImageInputSchema = z.object({
  alias: z.string().trim().min(1).optional(),
  channel_id: z.string().trim().min(1).optional(),
  dm_channel_id: z.string().trim().min(1).optional(),
  user_id: z.string().trim().min(1).optional(),
  initial_comment: z.string().trim().min(1).optional(),
  thread_ts: z.string().trim().min(1).optional(),
  manifest_path: z.string().trim().min(1).optional(),
});

type SlackUploadLastPromptImageInput = z.infer<typeof slackUploadLastPromptImageInputSchema>;

export function createSlackUploadLastPromptImageTool(deps: ToolDependencies): ToolDefinition<SlackUploadLastPromptImageInput> {
  return {
    name: 'slack_upload_last_prompt_image',
    description: 'Upload the latest prompt image captured by the local OpenCode plugin.',
    inputSchema: slackUploadLastPromptImageInputSchema,
    handler: async (input) => {
      try {
        const manifest = await readPromptImageManifest(input.manifest_path ?? deps.config.opencodeImageManifestPath);
        const uploadResult = await executeSlackUploadFile(deps, {
          alias: input.alias,
          channel_id: input.channel_id,
          dm_channel_id: input.dm_channel_id,
          user_id: input.user_id,
          file_path: manifest.filePath,
          initial_comment: input.initial_comment,
          thread_ts: input.thread_ts,
        });

        if (uploadResult.isError) {
          return uploadResult;
        }

        const payload = (uploadResult.structuredContent ?? {}) as { data?: Record<string, unknown> };
        return createSuccessResult('Uploaded the latest captured prompt image to Slack.', {
          manifest,
          upload: payload.data ?? {},
        });
      } catch (error) {
        return createErrorResult(error);
      }
    },
  };
}
