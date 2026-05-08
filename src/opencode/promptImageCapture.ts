import fs from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_CAPTURE_ROOT = '/tmp/puyu-slack-mcp/opencode-attachments';
export const DEFAULT_MANIFEST_PATH = path.join(DEFAULT_CAPTURE_ROOT, 'latest.json');

const IMAGE_EXTENSION_BY_MEDIA_TYPE = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
} as const;

interface DataUrlPayload {
  bytes: Buffer;
  mediaType?: string;
  sourceField: 'data-url';
}

interface CandidateCollection {
  value: unknown;
  path: string;
}

interface PromptImagePartRecord {
  type?: unknown;
  mediaType?: unknown;
  mimeType?: unknown;
  mime?: unknown;
  contentType?: unknown;
  data?: unknown;
  base64?: unknown;
  content?: unknown;
  source?: unknown;
  url?: unknown;
  path?: unknown;
  filePath?: unknown;
  bytes?: unknown;
}

interface PromptImageSourceRecord {
  mediaType?: unknown;
  mimeType?: unknown;
  mime?: unknown;
  data?: unknown;
  base64?: unknown;
  content?: unknown;
  url?: unknown;
  path?: unknown;
  filePath?: unknown;
}

export interface ExtractedPromptImagePart {
  bytes?: Buffer;
  sourcePath?: string;
  mediaType: string;
  partType: string;
  eventName: string;
  eventPath: string;
  sessionId: string;
  messageId: string;
  sourceField: string;
}

export interface PersistedPromptImageCapture {
  version: number;
  filePath: string;
  mediaType: string;
  sessionId: string;
  messageId: string;
  createdAt: string;
  source: {
    eventName: string;
    eventPath: string;
    partType: string;
    sourceField: string;
    sourcePath?: string;
  };
}

export interface PersistPromptImageCaptureOptions {
  captureRoot?: string;
  manifestPath?: string;
}

export interface PromptImageCaptureResult {
  saved: PersistedPromptImageCapture[];
  diagnostics: Record<string, unknown> | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isImageMediaType(value: string | undefined): boolean {
  return typeof value === 'string' && value.toLowerCase().startsWith('image/');
}

function normalizeMediaType(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim().toLowerCase();
    }
  }
  return undefined;
}

function normalizeId(value: unknown, fallback: string | undefined): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

function base64ToBuffer(value: unknown): Buffer | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const normalized = trimmed.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+=*$/.test(normalized)) {
    return undefined;
  }

  try {
    const buffer = Buffer.from(normalized, 'base64');
    return buffer.length > 0 ? buffer : undefined;
  } catch {
    return undefined;
  }
}

function extractFromDataUrl(value: unknown): DataUrlPayload | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const match = value.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
  if (!match) {
    return undefined;
  }

  const mediaType = normalizeMediaType(match[1]);
  const payload = match[3] ?? '';
  if (match[2]) {
    const bytes = base64ToBuffer(payload);
    if (!bytes) {
      return undefined;
    }
    return { bytes, mediaType, sourceField: 'data-url' };
  }

  return {
    bytes: Buffer.from(decodeURIComponent(payload), 'utf8'),
    mediaType,
    sourceField: 'data-url',
  };
}

function extractBinaryValue(value: unknown): Buffer | undefined {
  if (Buffer.isBuffer(value)) {
    return Buffer.from(value);
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  if (Array.isArray(value) && value.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 255)) {
    return Buffer.from(value);
  }
  return undefined;
}

function extractPathReference(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:')) {
    return undefined;
  }

  if (trimmed.startsWith('file://')) {
    return decodeURIComponent(new URL(trimmed).pathname);
  }

  return path.isAbsolute(trimmed) ? trimmed : undefined;
}

function guessExtension(mediaType: string): string {
  return IMAGE_EXTENSION_BY_MEDIA_TYPE[mediaType as keyof typeof IMAGE_EXTENSION_BY_MEDIA_TYPE] ?? 'bin';
}

function getNestedValue(value: unknown, pathSegments: readonly string[]): unknown {
  let current: unknown = value;
  for (const segment of pathSegments) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

export function extractPromptImageParts(eventPayload: unknown): ExtractedPromptImagePart[] {
  const eventRecord = getRecord(eventPayload);
  const payload = getRecord(eventRecord?.properties) ?? eventRecord ?? {};
  const eventName = normalizeId(eventRecord?.eventName ?? eventRecord?.name, 'unknown') ?? 'unknown';
  const sessionId =
    normalizeId(payload.sessionID, undefined) ??
    normalizeId(payload.sessionId, undefined) ??
    normalizeId(getNestedValue(payload, ['session', 'id']), undefined) ??
    normalizeId(getNestedValue(payload, ['message', 'sessionID']), undefined) ??
    normalizeId(getNestedValue(payload, ['message', 'sessionId']), undefined) ??
    'unknown';
  const messageId =
    normalizeId(payload.messageID, undefined) ??
    normalizeId(payload.messageId, undefined) ??
    normalizeId(getNestedValue(payload, ['message', 'id']), undefined) ??
    normalizeId(getNestedValue(payload, ['part', 'messageID']), undefined) ??
    normalizeId(getNestedValue(payload, ['part', 'messageId']), undefined) ??
    normalizeId(payload.id, undefined) ??
    String(Date.now());

  const candidateCollections: CandidateCollection[] = [
    { value: getNestedValue(payload, ['message', 'parts']), path: 'properties.message.parts' },
    { value: getNestedValue(payload, ['parts']), path: 'properties.parts' },
    { value: getNestedValue(payload, ['part']), path: 'properties.part' },
    { value: getNestedValue(payload, ['message']), path: 'properties.message' },
  ];

  const parts: ExtractedPromptImagePart[] = [];

  for (const collection of candidateCollections) {
    const items = Array.isArray(collection.value) ? collection.value : [collection.value];
    for (const [index, rawPart] of items.entries()) {
      if (!isRecord(rawPart)) {
        continue;
      }

      const part = rawPart as PromptImagePartRecord;
      const source = getRecord(part.source) as PromptImageSourceRecord | undefined;
      const mediaType = normalizeMediaType(
        part.mediaType,
        part.mimeType,
        part.mime,
        part.contentType,
        source?.mediaType,
        source?.mimeType,
        source?.mime,
      );
      const partType = normalizeId(part.type, 'unknown') ?? 'unknown';
      const looksLikeImagePart = partType === 'file' || partType === 'image' || isImageMediaType(mediaType);
      if (!looksLikeImagePart) {
        continue;
      }

      const fieldsToInspect: Array<[string, unknown]> = [
        ['data', part.data],
        ['base64', part.base64],
        ['content', part.content],
        ['source', part.source],
        ['source.data', source?.data],
        ['source.base64', source?.base64],
        ['source.content', source?.content],
        ['url', part.url],
        ['path', part.path],
        ['filePath', part.filePath],
        ['source.url', source?.url],
        ['source.path', source?.path],
        ['source.filePath', source?.filePath],
        ['bytes', part.bytes],
      ];

      for (const [fieldName, fieldValue] of fieldsToInspect) {
        const dataUrlPayload = extractFromDataUrl(fieldValue);
        if (dataUrlPayload && isImageMediaType(dataUrlPayload.mediaType ?? mediaType)) {
          parts.push({
            bytes: dataUrlPayload.bytes,
            mediaType: dataUrlPayload.mediaType ?? mediaType ?? 'image/unknown',
            partType,
            eventName,
            eventPath: `${collection.path}[${index}]`,
            sessionId,
            messageId,
            sourceField: fieldName,
          });
          break;
        }

        const binaryValue = extractBinaryValue(fieldValue);
        if (binaryValue && isImageMediaType(mediaType)) {
          parts.push({
            bytes: binaryValue,
            mediaType: mediaType ?? 'image/unknown',
            partType,
            eventName,
            eventPath: `${collection.path}[${index}]`,
            sessionId,
            messageId,
            sourceField: fieldName,
          });
          break;
        }

        const nestedBase64 = base64ToBuffer(fieldValue);
        if (nestedBase64 && isImageMediaType(mediaType)) {
          parts.push({
            bytes: nestedBase64,
            mediaType: mediaType ?? 'image/unknown',
            partType,
            eventName,
            eventPath: `${collection.path}[${index}]`,
            sessionId,
            messageId,
            sourceField: fieldName,
          });
          break;
        }

        const sourcePath = extractPathReference(fieldValue);
        if (sourcePath && isImageMediaType(mediaType)) {
          parts.push({
            sourcePath,
            mediaType: mediaType ?? 'image/unknown',
            partType,
            eventName,
            eventPath: `${collection.path}[${index}]`,
            sessionId,
            messageId,
            sourceField: fieldName,
          });
          break;
        }
      }
    }
  }

  return parts;
}

export function sanitizeEventDiagnostics(eventPayload: unknown): Record<string, unknown> {
  const diagnostics: Record<string, unknown> = {};
  if (!isRecord(eventPayload)) {
    return { rootType: typeof eventPayload };
  }

  for (const key of Object.keys(eventPayload).slice(0, 12)) {
    const value = eventPayload[key];
    if (Array.isArray(value)) {
      diagnostics[key] = `array(${value.length})`;
      continue;
    }
    if (typeof value === 'string') {
      diagnostics[key] = value.startsWith('data:') ? 'string(data-url)' : `string(${value.length})`;
      continue;
    }
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
      diagnostics[key] = 'binary';
      continue;
    }
    diagnostics[key] = typeof value;
  }

  const properties = getRecord(eventPayload.properties);
  if (properties) {
    diagnostics.propertiesKeys = Object.keys(properties).slice(0, 24);
    for (const key of Object.keys(properties).slice(0, 12)) {
      const value = properties[key];
      diagnostics[`properties.${key}`] = Array.isArray(value)
        ? `array(${value.length})`
        : isRecord(value)
          ? `object(${Object.keys(value).slice(0, 12).join(',')})`
          : typeof value === 'string'
            ? value.startsWith('data:')
              ? 'string(data-url)'
              : `string(${value.length})`
            : Buffer.isBuffer(value) || value instanceof Uint8Array
              ? 'binary'
              : typeof value;

      if (key === 'part' && isRecord(value)) {
        diagnostics['properties.partKeys'] = Object.keys(value).slice(0, 24);
        diagnostics['properties.part.type'] = typeof value.type === 'string' ? value.type : typeof value.type;
        diagnostics['properties.part.mime'] = typeof value.mime === 'string' ? value.mime : typeof value.mime;
        diagnostics['properties.part.filename'] =
          typeof value.filename === 'string' ? `string(${value.filename.length})` : typeof value.filename;
        diagnostics['properties.part.url'] =
          typeof value.url === 'string'
            ? value.url.startsWith('data:')
              ? 'string(data-url)'
              : value.url.startsWith('file:')
                ? 'string(file-url)'
                : `string(${value.url.length})`
            : typeof value.url;
        diagnostics['properties.part.source'] = isRecord(value.source)
          ? `object(${Object.keys(value.source).slice(0, 12).join(',')})`
          : typeof value.source;
      }
    }
  }

  return diagnostics;
}

export async function persistPromptImageCapture(
  extractedParts: readonly ExtractedPromptImagePart[],
  options: PersistPromptImageCaptureOptions = {},
): Promise<PersistedPromptImageCapture[]> {
  const captureRoot = options.captureRoot ?? DEFAULT_CAPTURE_ROOT;
  const manifestPath = options.manifestPath ?? DEFAULT_MANIFEST_PATH;
  const createdAt = new Date().toISOString();
  const saved: PersistedPromptImageCapture[] = [];

  for (const [index, part] of extractedParts.entries()) {
    const sessionId = part.sessionId || 'unknown';
    const messageId = part.messageId || String(Date.now());
    const targetDir = path.join(captureRoot, sessionId, messageId);
    const targetPath = path.join(targetDir, `image-${index + 1}.${guessExtension(part.mediaType)}`);
    const bytes = part.bytes ?? (part.sourcePath ? await fs.readFile(part.sourcePath) : undefined);
    if (!bytes) {
      continue;
    }
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(targetPath, bytes);

    saved.push({
      version: 1,
      filePath: targetPath,
      mediaType: part.mediaType,
      sessionId,
      messageId,
      createdAt,
      source: {
        eventName: part.eventName,
        eventPath: part.eventPath,
        partType: part.partType,
        sourceField: part.sourceField,
        sourcePath: part.sourcePath,
      },
    });
  }

  if (saved.length > 0) {
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(manifestPath, JSON.stringify(saved.at(-1), null, 2));
  }

  return saved;
}

export async function capturePromptImagesFromEvent(
  eventPayload: unknown,
  options: PersistPromptImageCaptureOptions = {},
): Promise<PromptImageCaptureResult> {
  const extractedParts = extractPromptImageParts(eventPayload);
  if (extractedParts.length === 0) {
    return { saved: [], diagnostics: sanitizeEventDiagnostics(eventPayload) };
  }

  const saved = await persistPromptImageCapture(extractedParts, options);
  return { saved, diagnostics: null };
}
