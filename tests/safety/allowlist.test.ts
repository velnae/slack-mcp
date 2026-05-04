import { describe, expect, it } from 'vitest';

import { enforceAllowlist } from '../../src/safety/allowlist.js';

describe('allowlist', () => {
  it('allows writes when allowlist is empty', () => {
    expect(() => enforceAllowlist({ kind: 'channel', channelId: 'C1' }, new Set())).not.toThrow();
  });

  it('blocks destinations outside allowlist', () => {
    expect(() => enforceAllowlist({ kind: 'channel', channelId: 'C1' }, new Set(['C2']))).toThrow(/SLACK_ALLOWED_CONVERSATIONS/);
  });
});
