import os from 'node:os';
import path from 'node:path';

import * as z from 'zod/v4';

export interface AppConfig {
  slackToken?: string;
  aliasPath: string;
  dryRun: boolean;
  allowedConversations: Set<string>;
  duplicateWindowMs: number;
  maxUploadBytes: number;
  opencodeImageManifestPath: string;
}

const envSchema = z.object({
  SLACK_TOKEN: z.string().trim().min(1).optional(),
  SLACK_ALIAS_PATH: z.string().trim().min(1).optional(),
  SLACK_DRY_RUN: z.string().trim().optional(),
  SLACK_ALLOWED_CONVERSATIONS: z.string().trim().optional(),
  SLACK_DUPLICATE_WINDOW_MS: z.string().trim().optional(),
  SLACK_MAX_UPLOAD_BYTES: z.string().trim().optional(),
  OPENCODE_IMAGE_MANIFEST_PATH: z.string().trim().min(1).optional(),
});

function parseBoolean(value?: string): boolean {
  if (!value) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function parseInteger(value: string | undefined, fallback: number, field: string): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${field} must be a positive integer.`);
  }
  return parsed;
}

export function expandHomePath(inputPath: string): string {
  if (inputPath === '~') {
    return os.homedir();
  }
  if (inputPath.startsWith('~/')) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

function parseAllowlist(value?: string): Set<string> {
  if (!value) return new Set<string>();
  return new Set(
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);

  return {
    slackToken: parsed.SLACK_TOKEN,
    aliasPath: expandHomePath(parsed.SLACK_ALIAS_PATH ?? '~/.config/opencode/slack/aliases.json'),
    dryRun: parseBoolean(parsed.SLACK_DRY_RUN),
    allowedConversations: parseAllowlist(parsed.SLACK_ALLOWED_CONVERSATIONS),
    duplicateWindowMs: parseInteger(parsed.SLACK_DUPLICATE_WINDOW_MS, 5 * 60 * 1000, 'SLACK_DUPLICATE_WINDOW_MS'),
    maxUploadBytes: parseInteger(parsed.SLACK_MAX_UPLOAD_BYTES, 20 * 1024 * 1024, 'SLACK_MAX_UPLOAD_BYTES'),
    opencodeImageManifestPath: parsed.OPENCODE_IMAGE_MANIFEST_PATH ?? '/tmp/puyu-slack-mcp/opencode-attachments/latest.json',
  };
}
