import fs from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { AliasRegistry } from '../../src/aliases/AliasRegistry.js';
import { createConfig } from '../helpers.js';

describe('AliasRegistry', () => {
  it('loads empty registry when file is missing', async () => {
    const registry = new AliasRegistry(createConfig().aliasPath);
    await expect(registry.load()).resolves.toEqual({ users: {}, channels: {} });
  });

  it('saves and resolves user aliases', async () => {
    const config = createConfig();
    const registry = new AliasRegistry(config.aliasPath);

    await registry.upsertUser('Silvia', { user_id: 'U1', dm_channel_id: 'D1', real_name: 'Silvia' });
    await expect(registry.resolve('silvia')).resolves.toMatchObject({ kind: 'user', userId: 'U1', dmChannelId: 'D1' });
  });

  it('protects existing aliases without overwrite', async () => {
    const config = createConfig();
    const registry = new AliasRegistry(config.aliasPath);
    await registry.upsertChannel('ventas', 'C1');

    await expect(registry.upsertChannel('ventas', 'C2')).rejects.toThrow(/already exists/);
  });

  it('writes compatible json shape', async () => {
    const config = createConfig();
    const registry = new AliasRegistry(config.aliasPath);

    await registry.upsertChannel('ventas', { channel_id: 'C1', name: 'ventas' });
    const raw = await fs.readFile(config.aliasPath, 'utf8');
    expect(JSON.parse(raw)).toMatchObject({ channels: { ventas: { channel_id: 'C1', name: 'ventas' } } });
  });
});
