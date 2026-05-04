import { createReadStream } from 'node:fs';

import { ErrorCode, WebClient } from '@slack/web-api';

import { SlackMcpError } from '../errors.js';
import type { SlackHistoryPage, UntrustedSlackMessage } from '../types.js';

export interface SlackSendInput {
  channelId: string;
  text: string;
  threadTs?: string;
}

export interface SlackUploadInput {
  channelId: string;
  filePath: string;
  filename: string;
  initialComment?: string;
  threadTs?: string;
}

export interface SlackSearchUsersInput {
  query: string;
  limit: number;
}

export interface SlackListChannelsInput {
  types: string[];
  limit: number;
  cursor?: string;
}

export class SlackAdapter {
  readonly client: WebClient;

  constructor(private readonly token?: string, client?: WebClient) {
    this.client = client ?? new WebClient(token);
  }

  private assertConfigured(): void {
    if (!this.token) {
      throw new SlackMcpError('CONFIG_ERROR', 'Slack token is not configured.', {
        hint: 'Set SLACK_TOKEN with a valid xoxb or xoxp token before using Slack API-backed tools.',
      });
    }
  }

  async sendMessage(input: SlackSendInput): Promise<{ channelId: string; ts: string; threadTs?: string }> {
    this.assertConfigured();
    try {
      const response = await this.client.chat.postMessage({
        channel: input.channelId,
        text: input.text,
        thread_ts: input.threadTs,
      } as never);

      return {
        channelId: response.channel ?? input.channelId,
        ts: response.ts ?? '',
        threadTs: input.threadTs,
      };
    } catch (error) {
      throw mapSlackError(error, ['chat:write']);
    }
  }

  async uploadFile(input: SlackUploadInput): Promise<{ fileId?: string; channelId: string; permalink?: string; threadTs?: string }> {
    this.assertConfigured();
    try {
      const response = await this.client.filesUploadV2({
        filename: input.filename,
        file: createReadStream(input.filePath),
        channel_id: input.channelId,
        initial_comment: input.initialComment,
        thread_ts: input.threadTs,
      } as never);

      const firstFile = (response.files?.[0] ?? {}) as { id?: string; permalink?: string };
      return {
        fileId: firstFile?.id,
        channelId: input.channelId,
        permalink: firstFile?.permalink,
        threadTs: input.threadTs,
      };
    } catch (error) {
      throw mapSlackError(error, ['files:write', 'chat:write']);
    }
  }

  async getHistory(channelId: string, limit: number, cursor?: string): Promise<SlackHistoryPage> {
    this.assertConfigured();
    try {
      const response = await this.client.conversations.history({
        channel: channelId,
        limit,
        cursor,
      } as never);

      return {
        channelId,
        messages: (response.messages ?? []).map((message) => toUntrustedMessage(message as Record<string, unknown>)),
        hasMore: response.has_more ?? false,
        nextCursor: response.response_metadata?.next_cursor || undefined,
      };
    } catch (error) {
      throw mapSlackError(error, ['channels:history', 'groups:history', 'im:history', 'mpim:history']);
    }
  }

  async getThread(channelId: string, threadTs: string, limit: number, cursor?: string): Promise<SlackHistoryPage> {
    this.assertConfigured();
    try {
      const response = await this.client.conversations.replies({
        channel: channelId,
        ts: threadTs,
        limit,
        cursor,
      } as never);

      return {
        channelId,
        messages: (response.messages ?? []).map((message) => toUntrustedMessage(message as Record<string, unknown>)),
        hasMore: response.has_more ?? false,
        nextCursor: response.response_metadata?.next_cursor || undefined,
      };
    } catch (error) {
      throw mapSlackError(error, ['channels:history', 'groups:history', 'im:history', 'mpim:history']);
    }
  }

  async searchUsers(input: SlackSearchUsersInput): Promise<{ users: Array<{ id: string; realName?: string; displayName?: string; email?: string }> }> {
    this.assertConfigured();
    try {
      const response = await this.client.users.list({ limit: Math.max(200, input.limit) });
      const query = input.query.toLowerCase();
      const users = (response.members ?? [])
        .filter((member) => !member.deleted && !member.is_bot)
        .filter((member) => {
          const haystack = [
            member.real_name,
            member.profile?.display_name,
            member.profile?.real_name,
            member.profile?.email,
            member.name,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();

          return haystack.includes(query);
        })
        .slice(0, input.limit)
        .map((member) => ({
          id: member.id ?? '',
          realName: member.real_name ?? member.profile?.real_name,
          displayName: member.profile?.display_name,
          email: member.profile?.email,
        }));

      return { users };
    } catch (error) {
      throw mapSlackError(error, ['users:read', 'users:read.email']);
    }
  }

  async listChannels(input: SlackListChannelsInput): Promise<{ channels: Array<{ id: string; name?: string; isMember?: boolean }>; nextCursor?: string }> {
    this.assertConfigured();
    try {
      const response = await this.client.conversations.list({
        types: input.types.join(','),
        limit: input.limit,
        cursor: input.cursor,
      } as never);

      return {
        channels: (response.channels ?? []).map((channel) => ({
          id: channel.id ?? '',
          name: channel.name,
          isMember: channel.is_member,
        })),
        nextCursor: response.response_metadata?.next_cursor || undefined,
      };
    } catch (error) {
      throw mapSlackError(error, ['channels:read', 'groups:read', 'im:read', 'mpim:read']);
    }
  }
}

function toUntrustedMessage(message: Record<string, unknown>): UntrustedSlackMessage {
  return {
    ts: String(message.ts ?? ''),
    user: message.user ? String(message.user) : undefined,
    text: message.text ? String(message.text) : undefined,
    subtype: message.subtype ? String(message.subtype) : undefined,
    threadTs: message.thread_ts ? String(message.thread_ts) : undefined,
    untrustedRemoteContent: true,
  };
}

function mapSlackError(error: unknown, scopes: string[]): SlackMcpError {
  if (isSlackPlatformError(error)) {
    const slackCode = error.data.error ?? 'unknown_error';
    if (['not_authed', 'invalid_auth', 'account_inactive'].includes(slackCode)) {
      return new SlackMcpError('SLACK_AUTH_ERROR', `Slack authentication failed: ${slackCode}.`, {
        hint: 'Verify SLACK_TOKEN and ensure the token type matches the required scopes.',
        details: { slackCode },
      });
    }

    if (slackCode === 'missing_scope') {
      return new SlackMcpError('SLACK_API_ERROR', 'Slack rejected the request because scopes are missing.', {
        hint: `Add one of these scopes to the app/token: ${scopes.join(', ')}`,
        details: { slackCode, scopes },
      });
    }

    if (slackCode === 'ratelimited') {
      return new SlackMcpError('SLACK_RATE_LIMITED', 'Slack rate-limited the request.', {
        hint: 'Wait and retry carefully to avoid duplicate writes.',
        details: { slackCode },
        uncertainWrite: true,
      });
    }

    return new SlackMcpError('SLACK_API_ERROR', `Slack API request failed: ${slackCode}.`, {
      details: { slackCode },
    });
  }

  if (isSlackRequestError(error)) {
    return new SlackMcpError('SLACK_REQUEST_ERROR', `Slack request failed: ${error.code}.`, {
      hint: 'Check network access and retry carefully if the write outcome is unknown.',
      details: { code: error.code },
      uncertainWrite: error.code !== ErrorCode.RequestError,
    });
  }

  return new SlackMcpError('SLACK_API_ERROR', error instanceof Error ? error.message : 'Unknown Slack API error.', {
    details: error,
  });
}

function isSlackPlatformError(error: unknown): error is { data: { error?: string } } {
  return typeof error === 'object' && error !== null && 'data' in error;
}

function isSlackRequestError(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error;
}
