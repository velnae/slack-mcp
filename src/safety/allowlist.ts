import { SlackMcpError } from '../errors.js';
import type { SlackDestination } from '../types.js';

export function destinationConversationId(destination: SlackDestination): string {
  return destination.kind === 'user' ? destination.dmChannelId : destination.channelId;
}

export function enforceAllowlist(destination: SlackDestination, allowedConversations: Set<string>): void {
  if (allowedConversations.size === 0) {
    return;
  }

  const conversationId = destinationConversationId(destination);
  if (!allowedConversations.has(conversationId)) {
    throw new SlackMcpError('ALLOWLIST_BLOCKED', 'Write blocked by SLACK_ALLOWED_CONVERSATIONS.', {
      hint: 'Add the destination conversation ID to SLACK_ALLOWED_CONVERSATIONS or remove the allowlist for local testing.',
      details: { conversationId },
    });
  }
}
