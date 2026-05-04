import os from 'node:os';
import path from 'node:path';

import { AliasRegistry } from '../src/aliases/AliasRegistry.js';
import type { AppConfig } from '../src/config.js';
import { DuplicateGuard } from '../src/safety/duplicateGuard.js';
import type { SlackAdapter } from '../src/slack/SlackAdapter.js';
import type { ToolDependencies } from '../src/tools/common.js';

export function createConfig(overrides?: Partial<AppConfig>): AppConfig {
  return {
    slackToken: 'xoxb-test-token',
    aliasPath: path.join(os.tmpdir(), `puyu-slack-mcp-${Math.random().toString(36).slice(2)}.json`),
    dryRun: false,
    allowedConversations: new Set<string>(),
    duplicateWindowMs: 5 * 60 * 1000,
    maxUploadBytes: 1024 * 1024,
    opencodeImageManifestPath: path.join(os.tmpdir(), `puyu-slack-mcp-manifest-${Math.random().toString(36).slice(2)}.json`),
    ...overrides,
  };
}

export function createDeps(overrides?: Partial<ToolDependencies>): ToolDependencies {
  const config = overrides?.config ?? createConfig();
  return {
    config,
    registry: overrides?.registry ?? new AliasRegistry(config.aliasPath),
    adapter: overrides?.adapter ?? ({} as SlackAdapter),
    duplicateGuard: overrides?.duplicateGuard ?? new DuplicateGuard(config.duplicateWindowMs, () => 1_000_000),
  };
}
