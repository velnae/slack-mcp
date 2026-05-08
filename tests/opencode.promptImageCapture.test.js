import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { capturePromptImagesFromEvent, extractPromptImageParts } from '../src/opencode/promptImageCapture.ts';

async function createTempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'puyu-slack-mcp-plugin-'));
}

describe('OpenCode prompt image capture helpers', () => {
  it('extracts image bytes from a data URL part', () => {
    const parts = extractPromptImageParts({
      eventName: 'message.updated',
      sessionId: 'session-1',
      message: {
        id: 'message-1',
        parts: [
          {
            type: 'image',
            mediaType: 'image/png',
            data: 'data:image/png;base64,ZmFrZS1wbmc=',
          },
        ],
      },
    });

    expect(parts).toHaveLength(1);
    expect(parts[0].mediaType).toBe('image/png');
    expect(parts[0].bytes.toString()).toBe('fake-png');
  });

  it('captures image parts to temp files and writes the latest manifest', async () => {
    const tempDir = await createTempDir();
    const manifestPath = path.join(tempDir, 'latest.json');
    const captureRoot = path.join(tempDir, 'captures');

    const result = await capturePromptImagesFromEvent(
      {
        eventName: 'message.part.updated',
        sessionID: 'session-2',
        messageID: 'message-2',
        part: {
          type: 'file',
          mimeType: 'image/jpeg',
          base64: Buffer.from('binary-jpg').toString('base64'),
        },
      },
      { captureRoot, manifestPath },
    );

    expect(result.saved).toHaveLength(1);
    const latest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    expect(latest).toMatchObject({
      filePath: result.saved[0].filePath,
      mediaType: 'image/jpeg',
      sessionId: 'session-2',
      messageId: 'message-2',
    });
    await expect(fs.readFile(result.saved[0].filePath, 'utf8')).resolves.toBe('binary-jpg');
  });

  it('returns sanitized diagnostics when event bytes are unavailable', async () => {
    const result = await capturePromptImagesFromEvent({
      eventName: 'message.updated',
      message: {
        id: 'message-3',
        parts: [{ type: 'image', mediaType: 'image/png', source: { href: 'https://example.com/image.png' } }],
      },
    });

    expect(result.saved).toHaveLength(0);
    expect(result.diagnostics).toMatchObject({ message: 'object' });
  });
});
