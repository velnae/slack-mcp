import fs from 'node:fs/promises';
import path from 'node:path';

import * as z from 'zod/v4';

import { SlackMcpError } from '../errors.js';

export const DEFAULT_OPENCODE_IMAGE_MANIFEST_PATH = '/tmp/puyu-slack-mcp/opencode-attachments/latest.json';

interface PromptImageManifestSource {
  eventName?: string;
  eventPath?: string;
  partType?: string;
  sourceField?: string;
}

export interface PromptImageManifest {
  version?: number;
  filePath: string;
  mediaType: string;
  sessionId?: string;
  messageId?: string;
  createdAt: string;
  source: PromptImageManifestSource;
}

const promptImageManifestSourceSchema = z.object({
  eventName: z.string().trim().min(1).optional(),
  eventPath: z.string().trim().min(1).optional(),
  partType: z.string().trim().min(1).optional(),
  sourceField: z.string().trim().min(1).optional(),
});

const promptImageManifestSchema = z.object({
  version: z.number().int().positive().optional(),
  filePath: z.string().trim().min(1),
  mediaType: z.string().trim().min(1),
  sessionId: z.string().trim().min(1).optional(),
  messageId: z.string().trim().min(1).optional(),
  createdAt: z.string().trim().min(1),
  source: promptImageManifestSourceSchema,
});

function isImageLikeMediaType(mediaType: string): boolean {
  return mediaType.toLowerCase().startsWith('image/');
}

export async function readPromptImageManifest(manifestPath: string): Promise<PromptImageManifest> {
  const resolvedManifestPath = path.resolve(manifestPath);
  const rawManifest = await fs.readFile(resolvedManifestPath, 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') {
      throw new SlackMcpError('NOT_FOUND', 'No captured OpenCode prompt image manifest was found.', {
        hint: 'Install the project-local OpenCode plugin and paste an image into the prompt before using slack_upload_last_prompt_image.',
        details: { manifestPath: resolvedManifestPath },
      });
    }
    throw error;
  });

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawManifest);
  } catch {
    throw new SlackMcpError('FILE_ERROR', 'OpenCode prompt image manifest is not valid JSON.', {
      hint: 'Re-capture the prompt image so the plugin can rewrite the manifest.',
      details: { manifestPath: resolvedManifestPath },
    });
  }

  const parsedManifest = promptImageManifestSchema.safeParse(parsedJson);
  if (!parsedManifest.success) {
    throw new SlackMcpError('FILE_ERROR', 'OpenCode prompt image manifest has an invalid shape.', {
      hint: 'Re-capture the prompt image with the latest plugin version.',
      details: {
        manifestPath: resolvedManifestPath,
        issues: parsedManifest.error.flatten(),
      },
    });
  }

  const manifest = parsedManifest.data;
  if (!isImageLikeMediaType(manifest.mediaType)) {
    throw new SlackMcpError('FILE_ERROR', 'OpenCode prompt image manifest does not point to an image.', {
      hint: 'Only image attachments can be uploaded through slack_upload_last_prompt_image.',
      details: { manifestPath: resolvedManifestPath, mediaType: manifest.mediaType },
    });
  }

  const stats = await fs.stat(manifest.filePath).catch(() => null);
  if (!stats || !stats.isFile()) {
    throw new SlackMcpError('NOT_FOUND', 'Captured OpenCode prompt image file no longer exists.', {
      hint: 'Paste the image into OpenCode again so the plugin can refresh the manifest.',
      details: { manifestPath: resolvedManifestPath, filePath: manifest.filePath },
    });
  }

  return manifest;
}
