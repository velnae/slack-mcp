import fs from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import { AliasRegistry } from '../src/aliases/AliasRegistry.js';
import { SlackMcpError } from '../src/errors.js';
import { createSlackAliasUpsertTool } from '../src/tools/slackAliasUpsert.js';
import { createSlackHistoryTool } from '../src/tools/slackHistory.js';
import { createSlackListChannelsTool } from '../src/tools/slackListChannels.js';
import { createSlackResolveAliasTool } from '../src/tools/slackResolveAlias.js';
import { createSlackSearchUsersTool } from '../src/tools/slackSearchUsers.js';
import { createSlackSendMessageTool } from '../src/tools/slackSendMessage.js';
import { createSlackThreadTool } from '../src/tools/slackThread.js';
import { createSlackUploadFileTool } from '../src/tools/slackUploadFile.js';
import { createSlackUploadLastPromptImageTool } from '../src/tools/slackUploadLastPromptImage.js';
import { SlackAdapter } from '../src/slack/SlackAdapter.js';
import { createDeps, createConfig } from './helpers.js';

describe('tool handlers', () => {
  it('returns alias resolution data', async () => {
    const config = createConfig();
    const registry = new AliasRegistry(config.aliasPath);
    await registry.upsertUser('silvia', { user_id: 'U1', dm_channel_id: 'D1' });
    const tool = createSlackResolveAliasTool(createDeps({ config, registry }));

    const result = await tool.handler({ alias: 'silvia' });
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toMatchObject({ ok: true, data: { dmChannelId: 'D1' } });
  });

  it('prevents alias overwrite without confirmation', async () => {
    const config = createConfig();
    const registry = new AliasRegistry(config.aliasPath);
    await registry.upsertChannel('ventas', 'C1');
    const tool = createSlackAliasUpsertTool(createDeps({ config, registry }));

    const result = await tool.handler({ alias: 'ventas', kind: 'channel', overwrite: false, channel_id: 'C2' });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text?: string } | undefined)?.text).toContain('AMBIGUOUS_DESTINATION');
  });

  it('uses dry-run for send without calling Slack', async () => {
    const config = createConfig({ dryRun: true });
    const registry = new AliasRegistry(config.aliasPath);
    await registry.upsertUser('silvia', { user_id: 'U1', dm_channel_id: 'D1' });
    const adapter = { sendMessage: vi.fn() };
    const tool = createSlackSendMessageTool(createDeps({ config, registry, adapter: adapter as never }));

    const result = await tool.handler({ alias: 'silvia', text: 'hola' });
    expect(adapter.sendMessage).not.toHaveBeenCalled();
    expect(result.structuredContent).toMatchObject({ ok: true, data: { dryRun: true } });
  });

  it('returns a configuration error when Slack token is missing', async () => {
    const tool = createSlackHistoryTool(
      createDeps({
        config: createConfig({ slackToken: undefined }),
        adapter: new SlackAdapter(undefined),
      }),
    );

    const result = await tool.handler({ channel_id: 'C1', limit: 10 });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ ok: false, error: { code: 'CONFIG_ERROR' } });
  });

  it('blocks ambiguous destination input before Slack access', async () => {
    const adapter = { sendMessage: vi.fn() };
    const tool = createSlackSendMessageTool(createDeps({ adapter: adapter as never }));

    const result = await tool.handler({ alias: 'silvia', channel_id: 'C1', text: 'hola' });
    expect(result.isError).toBe(true);
    expect(adapter.sendMessage).not.toHaveBeenCalled();
  });

  it('maps Slack send failures to structured errors', async () => {
    const config = createConfig();
    const registry = new AliasRegistry(config.aliasPath);
    await registry.upsertUser('silvia', { user_id: 'U1', dm_channel_id: 'D1' });
    const adapter = { sendMessage: vi.fn().mockRejectedValue(new SlackMcpError('SLACK_API_ERROR', 'boom')) };
    const tool = createSlackSendMessageTool(createDeps({ config, registry, adapter: adapter as never }));

    const result = await tool.handler({ alias: 'silvia', text: 'hola' });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ ok: false, error: { code: 'SLACK_API_ERROR' } });
  });

  it('sends a message by alias and returns Slack identifiers', async () => {
    const config = createConfig();
    const registry = new AliasRegistry(config.aliasPath);
    await registry.upsertUser('silvia', { user_id: 'U1', dm_channel_id: 'D1' });
    const adapter = { sendMessage: vi.fn().mockResolvedValue({ channelId: 'D1', ts: '123.456' }) };
    const tool = createSlackSendMessageTool(createDeps({ config, registry, adapter: adapter as never }));

    const result = await tool.handler({ alias: 'silvia', text: 'hola' });
    expect(adapter.sendMessage).toHaveBeenCalledWith({ channelId: 'D1', text: 'hola', threadTs: undefined });
    expect(result.structuredContent).toMatchObject({ ok: true, data: { channelId: 'D1', ts: '123.456' } });
  });

  it('preserves thread_ts when sending a thread reply', async () => {
    const adapter = { sendMessage: vi.fn().mockResolvedValue({ channelId: 'C1', ts: '123.457', threadTs: '123.000' }) };
    const tool = createSlackSendMessageTool(createDeps({ adapter: adapter as never }));

    const result = await tool.handler({ channel_id: 'C1', text: 'reply', thread_ts: '123.000' });
    expect(adapter.sendMessage).toHaveBeenCalledWith({ channelId: 'C1', text: 'reply', threadTs: '123.000' });
    expect(result.structuredContent).toMatchObject({ ok: true, data: { channelId: 'C1', threadTs: '123.000' } });
  });

  it('blocks duplicate alias retry after an uncertain send failure', async () => {
    const config = createConfig();
    const registry = new AliasRegistry(config.aliasPath);
    await registry.upsertUser('silvia', { user_id: 'U1', dm_channel_id: 'D1' });
    const adapter = {
      sendMessage: vi
        .fn()
        .mockRejectedValueOnce(new SlackMcpError('SLACK_RATE_LIMITED', 'rate limited', { uncertainWrite: true }))
        .mockResolvedValueOnce({ channelId: 'D1', ts: '123.456' }),
    };
    const tool = createSlackSendMessageTool(createDeps({ config, registry, adapter: adapter as never }));

    const first = await tool.handler({ alias: 'silvia', text: 'hola' });
    const second = await tool.handler({ alias: 'silvia', text: 'hola' });

    expect(first.isError).toBe(true);
    expect(second.isError).toBe(true);
    expect(adapter.sendMessage).toHaveBeenCalledTimes(1);
    expect(second.structuredContent).toMatchObject({ ok: false, error: { code: 'DUPLICATE_BLOCKED' } });
  });

  it('validates upload file path before Slack access', async () => {
    const tool = createSlackUploadFileTool(createDeps({ adapter: { uploadFile: vi.fn() } as never }));
    const result = await tool.handler({ channel_id: 'C1', file_path: '/missing/file.png' });
    expect(result.isError).toBe(true);
  });

  it('rejects uploads that exceed the configured size limit', async () => {
    const config = createConfig({ maxUploadBytes: 3 });
    const filePath = `${config.aliasPath}.png`;
    await fs.writeFile(filePath, 'demo');
    const adapter = { uploadFile: vi.fn() };
    const tool = createSlackUploadFileTool(createDeps({ config, adapter: adapter as never }));

    const result = await tool.handler({ channel_id: 'C1', file_path: filePath });
    expect(result.isError).toBe(true);
    expect(adapter.uploadFile).not.toHaveBeenCalled();
    expect(result.structuredContent).toMatchObject({ ok: false, error: { code: 'FILE_ERROR' } });
  });

  it('uploads a valid file through adapter', async () => {
    const config = createConfig();
    const filePath = `${config.aliasPath}.png`;
    await fs.writeFile(filePath, 'demo');
    const adapter = { uploadFile: vi.fn().mockResolvedValue({ fileId: 'F1', channelId: 'C1' }) };
    const tool = createSlackUploadFileTool(createDeps({ config, adapter: adapter as never }));

    const result = await tool.handler({ channel_id: 'C1', file_path: filePath, initial_comment: 'hola' });
    expect(adapter.uploadFile).toHaveBeenCalled();
    expect(result.structuredContent).toMatchObject({ ok: true, data: { fileId: 'F1' } });
  });

  it('uploads the latest captured prompt image through the existing upload path', async () => {
    const config = createConfig();
    const filePath = `${config.aliasPath}.png`;
    const manifestPath = `${config.aliasPath}.manifest.json`;
    await fs.writeFile(filePath, 'demo');
    await fs.writeFile(
      manifestPath,
      JSON.stringify({
        filePath,
        mediaType: 'image/png',
        sessionId: 'session-1',
        messageId: 'message-1',
        createdAt: '2026-05-04T00:00:00.000Z',
        source: { eventName: 'message.updated', sourceField: 'data' },
      }),
    );

    const adapter = { uploadFile: vi.fn().mockResolvedValue({ fileId: 'F2', channelId: 'C1' }) };
    const tool = createSlackUploadLastPromptImageTool(
      createDeps({
        config: createConfig({ opencodeImageManifestPath: manifestPath }),
        adapter: adapter as never,
      }),
    );

    const result = await tool.handler({ channel_id: 'C1', initial_comment: 'captured image' });

    expect(adapter.uploadFile).toHaveBeenCalledWith({
      channelId: 'C1',
      filePath,
      filename: filePath.split('/').pop(),
      initialComment: 'captured image',
      threadTs: undefined,
    });
    expect(result.structuredContent).toMatchObject({
      ok: true,
      data: {
        manifest: { filePath, mediaType: 'image/png' },
        upload: { fileId: 'F2', channelId: 'C1' },
      },
    });
  });

  it('returns a clear error when no captured prompt image exists', async () => {
    const config = createConfig({ opencodeImageManifestPath: `${createConfig().aliasPath}.missing.json` });
    const adapter = { uploadFile: vi.fn() };
    const tool = createSlackUploadLastPromptImageTool(createDeps({ config, adapter: adapter as never }));

    const result = await tool.handler({ channel_id: 'C1' });

    expect(result.isError).toBe(true);
    expect(adapter.uploadFile).not.toHaveBeenCalled();
    expect(result.structuredContent).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });

  it('blocks duplicate alias retry after an uncertain upload failure', async () => {
    const config = createConfig();
    const registry = new AliasRegistry(config.aliasPath);
    await registry.upsertUser('silvia', { user_id: 'U1', dm_channel_id: 'D1' });
    const filePath = `${config.aliasPath}.png`;
    await fs.writeFile(filePath, 'demo');
    const adapter = {
      uploadFile: vi
        .fn()
        .mockRejectedValueOnce(new SlackMcpError('SLACK_RATE_LIMITED', 'rate limited', { uncertainWrite: true }))
        .mockResolvedValueOnce({ fileId: 'F1', channelId: 'D1' }),
    };
    const tool = createSlackUploadFileTool(createDeps({ config, registry, adapter: adapter as never }));

    const first = await tool.handler({ alias: 'silvia', file_path: filePath, initial_comment: 'hola' });
    const second = await tool.handler({ alias: 'silvia', file_path: filePath, initial_comment: 'hola' });

    expect(first.isError).toBe(true);
    expect(second.isError).toBe(true);
    expect(adapter.uploadFile).toHaveBeenCalledTimes(1);
    expect(second.structuredContent).toMatchObject({ ok: false, error: { code: 'DUPLICATE_BLOCKED' } });
  });

  it('reads history and marks remote content untrusted', async () => {
    const adapter = {
      getHistory: vi.fn().mockResolvedValue({
        channelId: 'D1',
        messages: [{ ts: '1', text: 'hola', untrustedRemoteContent: true }],
        hasMore: false,
      }),
    };
    const tool = createSlackHistoryTool(createDeps({ adapter: adapter as never }));

    const result = await tool.handler({ dm_channel_id: 'D1', limit: 10 });
    expect(result.structuredContent).toMatchObject({ ok: true, data: { messages: [{ untrustedRemoteContent: true }] } });
  });

  it('reads thread replies with thread metadata', async () => {
    const adapter = {
      getThread: vi.fn().mockResolvedValue({
        channelId: 'C1',
        messages: [{ ts: '2', text: 'reply', untrustedRemoteContent: true }],
        hasMore: false,
      }),
    };
    const tool = createSlackThreadTool(createDeps({ adapter: adapter as never }));

    const result = await tool.handler({ channel_id: 'C1', thread_ts: '1.000', limit: 10 });
    expect(adapter.getThread).toHaveBeenCalledWith('C1', '1.000', 10, undefined);
    expect(result.structuredContent).toMatchObject({ ok: true, data: { threadTs: '1.000', messages: [{ ts: '2' }] } });
  });

  it('searches users without mutating aliases', async () => {
    const adapter = {
      searchUsers: vi.fn().mockResolvedValue({
        users: [{ id: 'U1', realName: 'Silvia', email: 'silvia@puyu.pe' }],
      }),
    };
    const tool = createSlackSearchUsersTool(createDeps({ adapter: adapter as never }));

    const result = await tool.handler({ query: 'silvia', limit: 5 });
    expect(adapter.searchUsers).toHaveBeenCalledWith({ query: 'silvia', limit: 5 });
    expect(result.structuredContent).toMatchObject({ ok: true, data: { users: [{ id: 'U1' }] } });
  });

  it('lists channels for alias creation support', async () => {
    const adapter = {
      listChannels: vi.fn().mockResolvedValue({
        channels: [{ id: 'C1', name: 'general', isMember: true }],
        nextCursor: 'next',
      }),
    };
    const tool = createSlackListChannelsTool(createDeps({ adapter: adapter as never }));

    const result = await tool.handler({ types: ['public_channel'], limit: 20 });
    expect(adapter.listChannels).toHaveBeenCalledWith({ types: ['public_channel'], limit: 20 });
    expect(result.structuredContent).toMatchObject({ ok: true, data: { channels: [{ id: 'C1' }], nextCursor: 'next' } });
  });
});
