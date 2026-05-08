import {
  capturePromptImagesFromEvent,
  sanitizeEventDiagnostics,
} from './promptImageCapture.js';

type LogLevel = 'info' | 'warn' | 'error';

type LogMeta = Record<string, unknown>;

type LogTarget = (message: string, meta?: LogMeta) => Promise<unknown> | unknown;

interface OpenCodeAppLogger {
  log?: (payload: {
    body: {
      service: string;
      level: LogLevel;
      message: string;
      extra?: LogMeta;
    };
  }) => Promise<unknown> | unknown;
}

interface OpenCodeClientLike {
  app?: OpenCodeAppLogger;
  log?: LogTarget;
  info?: LogTarget;
  warn?: LogTarget;
  error?: LogTarget;
}

interface PluginContextLike extends OpenCodeClientLike {
  client?: OpenCodeClientLike;
}

interface MessageEventLike {
  type?: string;
  [key: string]: unknown;
}

interface PluginEventInput {
  event?: MessageEventLike;
}

export interface OpenCodePluginHooks {
  event?: (input: PluginEventInput) => Promise<void>;
  'message.updated'?: (payload: unknown) => Promise<void>;
  'message.part.updated'?: (payload: unknown) => Promise<void>;
}

type OpenCodePlugin = (context?: unknown) => Promise<OpenCodePluginHooks> | OpenCodePluginHooks;

interface Logger {
  info(message: string, meta?: LogMeta): Promise<void>;
  warn(message: string, meta?: LogMeta): Promise<void>;
  error(message: string, meta?: LogMeta): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getClient(context: unknown): OpenCodeClientLike | undefined {
  if (!isRecord(context)) {
    return undefined;
  }

  const candidate = isRecord(context.client) ? (context.client as OpenCodeClientLike) : undefined;
  return candidate ?? (context as PluginContextLike);
}

function createLogger(context: unknown): Logger {
  const client = getClient(context);

  async function call(level: LogLevel, message: string, meta?: LogMeta): Promise<void> {
    if (typeof client?.app?.log === 'function') {
      await client.app.log({
        body: {
          service: 'velnae-slack-mcp-prompt-image-bridge',
          level,
          message,
          extra: meta,
        },
      });
      return;
    }

    const target = client?.[level] ?? client?.log;
    if (typeof target === 'function') {
      await target.call(client, message, meta);
    }
  }

  return {
    async info(message, meta) {
      await call('info', message, meta);
    },
    async warn(message, meta) {
      await call('warn', message, meta);
    },
    async error(message, meta) {
      await call('error', message, meta);
    },
  };
}

async function handleEvent(eventName: string, payload: unknown, logger: Logger): Promise<void> {
  try {
    const normalizedPayload = isRecord(payload) ? { ...payload, eventName } : { payload, eventName };
    const result = await capturePromptImagesFromEvent(normalizedPayload);
    if (result.saved.length > 0) {
      await logger.info('[velnae/slack-mcp] captured OpenCode prompt image', {
        eventName,
        count: result.saved.length,
        latestPath: result.saved.at(-1)?.filePath,
      });
      return;
    }

    await logger.warn('[velnae/slack-mcp] prompt image event had no extractable bytes', {
      eventName,
      diagnostics: result.diagnostics ?? sanitizeEventDiagnostics(payload),
    });
  } catch (error) {
    await logger.error('[velnae/slack-mcp] prompt image capture failed', {
      eventName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const SlackMcpPlugin: OpenCodePlugin = async (context = {}) => {
  const logger = createLogger(context);
  const availableContextKeys = isRecord(context) ? Object.keys(context).slice(0, 12) : [];

  void logger.info('[velnae/slack-mcp] prompt image bridge plugin registered', {
    availableContextKeys,
  });

  return {
    event: async ({ event }) => {
      if (event?.type === 'message.updated' || event?.type === 'message.part.updated') {
        await handleEvent(event.type, event, logger);
      }
    },
    'message.updated': async (payload) => {
      await handleEvent('message.updated', payload, logger);
    },
    'message.part.updated': async (payload) => {
      await handleEvent('message.part.updated', payload, logger);
    },
  };
};

export default SlackMcpPlugin;
