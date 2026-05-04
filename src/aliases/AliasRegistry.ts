import fs from 'node:fs/promises';
import path from 'node:path';

import { SlackMcpError } from '../errors.js';
import type { AliasRegistryFile, ChannelAliasRecord, SlackDestination, UserAliasRecord } from '../types.js';

function normalizeChannelRecord(record: ChannelAliasRecord): { channelId: string; name?: string } {
  if (typeof record === 'string') {
    return { channelId: record };
  }

  return {
    channelId: record.channel_id,
    name: record.name,
  };
}

export class AliasRegistry {
  constructor(private readonly filePath: string) {}

  static normalizeAlias(alias: string): string {
    return alias.trim().toLowerCase();
  }

  async load(): Promise<AliasRegistryFile> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as AliasRegistryFile;
      return {
        users: parsed.users ?? {},
        channels: parsed.channels ?? {},
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { users: {}, channels: {} };
      }
      throw new SlackMcpError('CONFIG_ERROR', 'Failed to read alias registry.', {
        hint: `Check JSON formatting and path: ${this.filePath}`,
        details: error,
      });
    }
  }

  async save(data: AliasRegistryFile): Promise<void> {
    const directory = path.dirname(this.filePath);
    await fs.mkdir(directory, { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    await fs.rename(tempPath, this.filePath);
  }

  async resolve(alias: string): Promise<SlackDestination | null> {
    const normalized = AliasRegistry.normalizeAlias(alias);
    const data = await this.load();

    const user = data.users?.[normalized];
    if (user) {
      return {
        kind: 'user',
        alias: normalized,
        userId: user.user_id,
        dmChannelId: user.dm_channel_id,
        realName: user.real_name,
        email: user.email,
      };
    }

    const channel = data.channels?.[normalized];
    if (channel) {
      const normalizedChannel = normalizeChannelRecord(channel);
      return {
        kind: 'channel',
        alias: normalized,
        channelId: normalizedChannel.channelId,
        name: normalizedChannel.name,
      };
    }

    return null;
  }

  async upsertUser(alias: string, record: UserAliasRecord, overwrite = false): Promise<{ alias: string; created: boolean }> {
    const normalized = AliasRegistry.normalizeAlias(alias);
    const data = await this.load();
    const exists = Boolean(data.users?.[normalized] ?? data.channels?.[normalized]);

    if (exists && !overwrite) {
      throw new SlackMcpError('AMBIGUOUS_DESTINATION', `Alias '${normalized}' already exists.`, {
        hint: 'Retry with overwrite=true only after confirming the replacement destination.',
        details: { alias: normalized },
      });
    }

    data.users ??= {};
    delete data.channels?.[normalized];
    data.users[normalized] = record;
    await this.save(data);
    return { alias: normalized, created: !exists };
  }

  async upsertChannel(alias: string, record: ChannelAliasRecord, overwrite = false): Promise<{ alias: string; created: boolean }> {
    const normalized = AliasRegistry.normalizeAlias(alias);
    const data = await this.load();
    const exists = Boolean(data.channels?.[normalized] ?? data.users?.[normalized]);

    if (exists && !overwrite) {
      throw new SlackMcpError('AMBIGUOUS_DESTINATION', `Alias '${normalized}' already exists.`, {
        hint: 'Retry with overwrite=true only after confirming the replacement destination.',
        details: { alias: normalized },
      });
    }

    data.channels ??= {};
    delete data.users?.[normalized];
    data.channels[normalized] = record;
    await this.save(data);
    return { alias: normalized, created: !exists };
  }
}
