import { SlackMcpError } from '../errors.js';
import type { DuplicateAttempt } from '../types.js';

export class DuplicateGuard {
  private readonly attempts = new Map<string, DuplicateAttempt>();

  constructor(private readonly windowMs: number, private readonly now: () => number = () => Date.now()) {}

  private prune(): void {
    const cutoff = this.now() - this.windowMs;
    for (const [key, attempt] of this.attempts.entries()) {
      if (attempt.createdAt < cutoff) {
        this.attempts.delete(key);
      }
    }
  }

  assertNotDuplicate(key: string): void {
    this.prune();
    const existing = this.attempts.get(key);
    if (!existing) {
      return;
    }

    throw new SlackMcpError('DUPLICATE_BLOCKED', 'Duplicate write blocked after a recent uncertain result.', {
      hint: 'Review the earlier attempt metadata before retrying manually.',
      details: existing,
    });
  }

  remember(attempt: DuplicateAttempt): void {
    this.prune();
    this.attempts.set(attempt.key, attempt);
  }

  clear(key: string): void {
    this.attempts.delete(key);
  }
}
