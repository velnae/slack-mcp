import { SlackMcpError } from '../errors.js';
import type { AliasRegistry } from '../aliases/AliasRegistry.js';
import type { ChannelDestination, SlackDestination, UserDestination } from '../types.js';

export interface DestinationRequest {
  alias?: string;
  channelId?: string;
  dmChannelId?: string;
  userId?: string;
}

export interface ResolvedDestination {
  destination: SlackDestination;
  source: 'alias' | 'explicit';
}

export async function resolveDestination(registry: AliasRegistry, request: DestinationRequest): Promise<ResolvedDestination> {
  if (request.alias) {
    if (request.channelId || request.dmChannelId || request.userId) {
      throw new SlackMcpError('AMBIGUOUS_DESTINATION', 'Provide either alias OR explicit IDs, not both.', {
        hint: 'Use slack_resolve_alias first if you need to inspect the alias result.',
      });
    }

    const aliasMatch = await registry.resolve(request.alias);
    if (!aliasMatch) {
      throw new SlackMcpError('NOT_FOUND', `Alias '${request.alias}' was not found.`, {
        hint: 'Create it with slack_alias_upsert or provide an explicit channel ID.',
      });
    }

    return { destination: aliasMatch, source: 'alias' };
  }

  const explicit = resolveExplicit(request);
  if (!explicit) {
    throw new SlackMcpError('VALIDATION_ERROR', 'A destination alias or explicit conversation ID is required.', {
      hint: 'Provide alias, channel_id, or dm_channel_id.',
    });
  }

  return { destination: explicit, source: 'explicit' };
}

function resolveExplicit(request: DestinationRequest): SlackDestination | null {
  if (request.channelId && request.dmChannelId) {
    throw new SlackMcpError('AMBIGUOUS_DESTINATION', 'Provide channel_id or dm_channel_id, not both.');
  }

  if (request.channelId) {
    const destination: ChannelDestination = {
      kind: 'channel',
      channelId: request.channelId,
    };
    return destination;
  }

  if (request.dmChannelId) {
    const destination: UserDestination = {
      kind: 'user',
      dmChannelId: request.dmChannelId,
      userId: request.userId ?? 'unknown',
    };
    return destination;
  }

  return null;
}
