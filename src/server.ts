import { McpServer } from '@modelcontextprotocol/server';

import { AliasRegistry } from './aliases/AliasRegistry.js';
import type { AppConfig } from './config.js';
import { DuplicateGuard } from './safety/duplicateGuard.js';
import { SlackAdapter } from './slack/SlackAdapter.js';
import { MCP_SERVER_NAME, PACKAGE_VERSION } from './packageMeta.js';
import { createSlackAliasUpsertTool } from './tools/slackAliasUpsert.js';
import { createSlackHistoryTool } from './tools/slackHistory.js';
import { createSlackListChannelsTool } from './tools/slackListChannels.js';
import { createSlackResolveAliasTool } from './tools/slackResolveAlias.js';
import { createSlackSearchUsersTool } from './tools/slackSearchUsers.js';
import { createSlackSendMessageTool } from './tools/slackSendMessage.js';
import { createSlackThreadTool } from './tools/slackThread.js';
import { createSlackUploadFileTool } from './tools/slackUploadFile.js';
import { createSlackUploadLastPromptImageTool } from './tools/slackUploadLastPromptImage.js';
import type { ToolDependencies, ToolDefinition } from './tools/common.js';

export interface ToolRegistrar {
  registerTool: (name: string, config: { description: string; inputSchema: unknown }, handler: (input: unknown) => Promise<unknown>) => unknown;
}

export function createToolDependencies(config: AppConfig): ToolDependencies {
  return {
    config,
    registry: new AliasRegistry(config.aliasPath),
    adapter: new SlackAdapter(config.slackToken),
    duplicateGuard: new DuplicateGuard(config.duplicateWindowMs),
  };
}

export function getToolDefinitions(deps: ToolDependencies): ToolDefinition<unknown>[] {
  return [
    createSlackResolveAliasTool(deps),
    createSlackSendMessageTool(deps),
    createSlackUploadFileTool(deps),
    createSlackUploadLastPromptImageTool(deps),
    createSlackHistoryTool(deps),
    createSlackThreadTool(deps),
    createSlackSearchUsersTool(deps),
    createSlackListChannelsTool(deps),
    createSlackAliasUpsertTool(deps),
  ] as ToolDefinition<unknown>[];
}

export function registerTools(registrar: ToolRegistrar, deps: ToolDependencies): void {
  for (const tool of getToolDefinitions(deps)) {
    registrar.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      tool.handler as (input: unknown) => Promise<unknown>,
    );
  }
}

export function createSlackMcpServer(deps: ToolDependencies): McpServer {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: PACKAGE_VERSION,
  });
  registerTools(server as unknown as ToolRegistrar, deps);
  return server;
}
