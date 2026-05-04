import * as z from 'zod/v4';

import { describe, expect, it, vi } from 'vitest';

import { getToolDefinitions, registerTools } from '../src/server.js';
import { createDeps } from './helpers.js';

describe('server registration', () => {
  it('exposes the required tools', () => {
    const defs = getToolDefinitions(createDeps());
    expect(defs.map((tool) => tool.name)).toEqual([
      'slack_resolve_alias',
      'slack_send_message',
      'slack_upload_file',
      'slack_upload_last_prompt_image',
      'slack_history',
      'slack_thread',
      'slack_search_users',
      'slack_list_channels',
      'slack_alias_upsert',
    ]);
  });

  it('registers tool descriptions and schemas', () => {
    const registered: Array<{ name: string; description: string; inputSchema: unknown }> = [];
    registerTools(
      {
        registerTool(name, config) {
          registered.push({ name, description: config.description, inputSchema: config.inputSchema });
        },
      },
      createDeps(),
    );

    expect(registered).toHaveLength(9);
    expect(registered.every((item) => item.description.length > 0)).toBe(true);
    expect(registered.every((item) => item.inputSchema)).toBe(true);
  });

  it('exposes schemas that reject invalid input before handler execution', async () => {
    const handler = vi.fn();
    const defs = getToolDefinitions(createDeps({ adapter: { sendMessage: handler } as never }));
    const sendTool = defs.find((tool) => tool.name === 'slack_send_message');

    expect(sendTool).toBeDefined();
    const schema = sendTool?.inputSchema as z.ZodType;
    expect(() => schema.parse({ alias: 'silvia' })).toThrow();
    expect(handler).not.toHaveBeenCalled();
  });
});
