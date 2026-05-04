import fs from 'node:fs/promises';
import path from 'node:path';

import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { SlackMcpError } from '../errors.js';
import { resolveDestination } from '../resolution/destinationResolver.js';
import { enforceAllowlist, destinationConversationId } from '../safety/allowlist.js';
import { createDryRunData } from '../safety/dryRun.js';
import { createErrorResult, createSuccessResult } from './common.js';
import type { ToolDefinition, ToolDependencies } from './common.js';

export const slackUploadFileInputSchema = z.object({
  alias: z.string().trim().min(1).optional(),
  channel_id: z.string().trim().min(1).optional(),
  dm_channel_id: z.string().trim().min(1).optional(),
  user_id: z.string().trim().min(1).optional(),
  file_path: z.string().trim().min(1),
  initial_comment: z.string().trim().min(1).optional(),
  thread_ts: z.string().trim().min(1).optional(),
});

export type SlackUploadFileInput = z.infer<typeof slackUploadFileInputSchema>;

export async function executeSlackUploadFile(deps: ToolDependencies, input: SlackUploadFileInput): Promise<CallToolResult> {
  let dedupeKey: string | undefined;
  let destinationId: string | undefined;
  try {
    const stats = await fs.stat(input.file_path).catch(() => null);
    if (!stats || !stats.isFile()) {
      throw new SlackMcpError('FILE_ERROR', 'Local file does not exist.', {
        hint: 'Provide an existing local file path before calling slack_upload_file.',
        details: { file_path: input.file_path },
      });
    }
    if (stats.size > deps.config.maxUploadBytes) {
      throw new SlackMcpError('FILE_ERROR', 'Local file exceeds configured upload limit.', {
        hint: `Increase SLACK_MAX_UPLOAD_BYTES or choose a smaller file. Current limit: ${deps.config.maxUploadBytes} bytes.`,
        details: { file_path: input.file_path, size: stats.size },
      });
    }

    const { destination } = await resolveDestination(deps.registry, {
      alias: input.alias,
      channelId: input.channel_id,
      dmChannelId: input.dm_channel_id,
      userId: input.user_id,
    });

    enforceAllowlist(destination, deps.config.allowedConversations);
    destinationId = destinationConversationId(destination);
    dedupeKey = `upload:${destinationId}:${input.thread_ts ?? 'root'}:${input.file_path}:${input.initial_comment ?? ''}`;
    deps.duplicateGuard.assertNotDuplicate(dedupeKey);

    if (deps.config.dryRun) {
      return createSuccessResult(
        'Dry-run: Slack file upload not sent.',
        createDryRunData('upload_file', destination, {
          file_path: input.file_path,
          initial_comment: input.initial_comment,
          thread_ts: input.thread_ts,
        }).data,
      );
    }

    const channelId = destination.kind === 'user' ? destination.dmChannelId : destination.channelId;
    const result = await deps.adapter.uploadFile({
      channelId,
      filePath: input.file_path,
      filename: path.basename(input.file_path),
      initialComment: input.initial_comment,
      threadTs: input.thread_ts,
    });
    deps.duplicateGuard.clear(dedupeKey);
    return createSuccessResult(`Uploaded file to ${channelId}.`, { destination, ...result });
  } catch (error) {
    if (error instanceof SlackMcpError && error.uncertainWrite && dedupeKey && destinationId) {
      deps.duplicateGuard.remember({
        key: dedupeKey,
        destinationId,
        summary: input.file_path,
        createdAt: Date.now(),
        reason: error.message,
      });
    }
    return createErrorResult(error);
  }
}

export function createSlackUploadFileTool(deps: ToolDependencies): ToolDefinition<SlackUploadFileInput> {
  return {
    name: 'slack_upload_file',
    description: 'Upload a local file to Slack with optional initial comment.',
    inputSchema: slackUploadFileInputSchema,
    handler: async (input) => executeSlackUploadFile(deps, input),
  };
}
