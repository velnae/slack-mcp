import { describe, expect, it } from 'vitest';

import { DuplicateGuard } from '../../src/safety/duplicateGuard.js';

describe('duplicate guard', () => {
  it('blocks a remembered duplicate within the window', () => {
    const guard = new DuplicateGuard(1000, () => 1_000);
    guard.remember({ key: 'send:key', destinationId: 'C1', summary: 'hello', createdAt: 1_000, reason: 'timeout' });
    expect(() => guard.assertNotDuplicate('send:key')).toThrow(/Duplicate write blocked/);
  });

  it('expires old attempts', () => {
    let now = 5_000;
    const guard = new DuplicateGuard(1000, () => now);
    guard.remember({ key: 'send:key', destinationId: 'C1', summary: 'hello', createdAt: 1_000, reason: 'timeout' });
    now = 10_000;
    expect(() => guard.assertNotDuplicate('send:key')).not.toThrow();
  });
});
