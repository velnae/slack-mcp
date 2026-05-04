import { capturePromptImagesFromEvent, sanitizeEventDiagnostics } from './lib/prompt-image-capture.js';

function createLogger(context) {
  const client = context?.client ?? context;

  async function call(level, message, meta) {
    if (typeof client?.app?.log === 'function') {
      await client.app.log({
        body: {
          service: 'puyu-slack-mcp-prompt-image-bridge',
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

async function handleEvent(eventName, payload, logger) {
  try {
    const result = await capturePromptImagesFromEvent({ ...payload, eventName });
    if (result.saved.length > 0) {
      logger.info('[puyu-slack-mcp] captured OpenCode prompt image', {
        eventName,
        count: result.saved.length,
        latestPath: result.saved.at(-1)?.filePath,
      });
      return;
    }

    logger.warn('[puyu-slack-mcp] prompt image event had no extractable bytes', {
      eventName,
      diagnostics: result.diagnostics ?? sanitizeEventDiagnostics(payload),
    });
  } catch (error) {
    logger.error('[puyu-slack-mcp] prompt image capture failed', {
      eventName,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function registerPromptImageBridge(context = {}) {
  const logger = createLogger(context);

  logger.info('[puyu-slack-mcp] prompt image bridge plugin registered', {
    availableContextKeys: Object.keys(context ?? {}).slice(0, 12),
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
}

export default registerPromptImageBridge;
