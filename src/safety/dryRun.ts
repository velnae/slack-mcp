import type { SlackDestination } from '../types.js';

export function createDryRunData(action: 'send_message' | 'upload_file', destination: SlackDestination, payload: Record<string, unknown>) {
  return {
    ok: true as const,
    data: {
      dryRun: true,
      action,
      destination,
      payload,
    },
  };
}
