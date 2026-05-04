import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readPromptImageManifest } from '../src/opencode/promptImageManifest.js';

async function createTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'puyu-slack-mcp-manifest-'));
}

describe('prompt image manifest', () => {
  it('reads a valid manifest and verifies the image file exists', async () => {
    const tempDir = await createTempDir();
    const filePath = path.join(tempDir, 'image-1.png');
    const manifestPath = path.join(tempDir, 'latest.json');

    await fs.writeFile(filePath, 'png-data');
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

    await expect(readPromptImageManifest(manifestPath)).resolves.toMatchObject({
      filePath,
      mediaType: 'image/png',
      sessionId: 'session-1',
      messageId: 'message-1',
    });
  });

  it('fails clearly when the manifest does not exist', async () => {
    const tempDir = await createTempDir();

    await expect(readPromptImageManifest(path.join(tempDir, 'missing.json'))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('fails when the manifest points to a missing captured file', async () => {
    const tempDir = await createTempDir();
    const manifestPath = path.join(tempDir, 'latest.json');

    await fs.writeFile(
      manifestPath,
      JSON.stringify({
        filePath: path.join(tempDir, 'missing.png'),
        mediaType: 'image/png',
        createdAt: '2026-05-04T00:00:00.000Z',
        source: { eventName: 'message.updated' },
      }),
    );

    await expect(readPromptImageManifest(manifestPath)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('fails when the manifest shape is invalid', async () => {
    const tempDir = await createTempDir();
    const manifestPath = path.join(tempDir, 'latest.json');

    await fs.writeFile(manifestPath, JSON.stringify({ nope: true }));

    await expect(readPromptImageManifest(manifestPath)).rejects.toMatchObject({
      code: 'FILE_ERROR',
    });
  });

  it('fails when the manifest media type is not an image', async () => {
    const tempDir = await createTempDir();
    const filePath = path.join(tempDir, 'file.txt');
    const manifestPath = path.join(tempDir, 'latest.json');

    await fs.writeFile(filePath, 'plain text');
    await fs.writeFile(
      manifestPath,
      JSON.stringify({
        filePath,
        mediaType: 'text/plain',
        createdAt: '2026-05-04T00:00:00.000Z',
        source: { eventName: 'message.updated' },
      }),
    );

    await expect(readPromptImageManifest(manifestPath)).rejects.toMatchObject({
      code: 'FILE_ERROR',
    });
  });
});
