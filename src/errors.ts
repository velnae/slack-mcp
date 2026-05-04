import { ZodError } from 'zod/v4';

import type { ToolErrorCode, ToolErrorShape } from './types.js';

export class SlackMcpError extends Error {
  readonly code: ToolErrorCode;
  readonly hint?: string;
  readonly details?: unknown;
  readonly uncertainWrite: boolean;

  constructor(code: ToolErrorCode, message: string, options?: { hint?: string; details?: unknown; uncertainWrite?: boolean }) {
    super(message);
    this.name = 'SlackMcpError';
    this.code = code;
    this.hint = options?.hint;
    this.details = options?.details;
    this.uncertainWrite = options?.uncertainWrite ?? false;
  }
}

export function toToolError(error: unknown): ToolErrorShape {
  if (error instanceof SlackMcpError) {
    return {
      code: error.code,
      message: error.message,
      hint: error.hint,
      details: error.details,
    };
  }

  if (error instanceof ZodError) {
    return {
      code: 'VALIDATION_ERROR',
      message: 'Invalid tool input.',
      details: error.flatten(),
    };
  }

  if (error instanceof Error) {
    return {
      code: 'INTERNAL_ERROR',
      message: error.message,
    };
  }

  return {
    code: 'INTERNAL_ERROR',
    message: 'Unknown internal error.',
    details: error,
  };
}
