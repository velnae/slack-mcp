import { describe, expect, it } from 'vitest';

import { expandHomePath, loadConfig } from '../src/config.js';

describe('config', () => {
  it('loads defaults and expands alias path', () => {
    const config = loadConfig({});
    expect(config.aliasPath).toContain('/.config/opencode/slack/aliases.json');
    expect(config.dryRun).toBe(false);
    expect(config.allowedConversations.size).toBe(0);
    expect(config.opencodeImageManifestPath).toBe('/tmp/puyu-slack-mcp/opencode-attachments/latest.json');
  });

  it('parses booleans, allowlist, and integer limits', () => {
    const config = loadConfig({
      SLACK_DRY_RUN: 'true',
      SLACK_ALLOWED_CONVERSATIONS: 'C1, D2',
      SLACK_DUPLICATE_WINDOW_MS: '1234',
      SLACK_MAX_UPLOAD_BYTES: '2048',
      OPENCODE_IMAGE_MANIFEST_PATH: '/tmp/custom-manifest.json',
    });

    expect(config.dryRun).toBe(true);
    expect(config.allowedConversations.has('C1')).toBe(true);
    expect(config.allowedConversations.has('D2')).toBe(true);
    expect(config.duplicateWindowMs).toBe(1234);
    expect(config.maxUploadBytes).toBe(2048);
    expect(config.opencodeImageManifestPath).toBe('/tmp/custom-manifest.json');
  });

  it('rejects invalid integer config', () => {
    expect(() => loadConfig({ SLACK_MAX_UPLOAD_BYTES: 'nope' })).toThrow(/SLACK_MAX_UPLOAD_BYTES/);
  });

  it('expands a home path', () => {
    expect(expandHomePath('~/demo')).not.toBe('~/demo');
  });
});
