export type DestinationKind = 'user' | 'channel';

export interface UserDestination {
  kind: 'user';
  alias?: string;
  userId: string;
  dmChannelId: string;
  realName?: string;
  email?: string;
}

export interface ChannelDestination {
  kind: 'channel';
  alias?: string;
  channelId: string;
  name?: string;
}

export type SlackDestination = UserDestination | ChannelDestination;

export interface UserAliasRecord {
  user_id: string;
  dm_channel_id: string;
  real_name?: string;
  email?: string;
}

export interface ChannelAliasObject {
  channel_id: string;
  name?: string;
}

export type ChannelAliasRecord = string | ChannelAliasObject;

export interface AliasRegistryFile {
  users?: Record<string, UserAliasRecord>;
  channels?: Record<string, ChannelAliasRecord>;
}

export type ToolErrorCode =
  | 'VALIDATION_ERROR'
  | 'CONFIG_ERROR'
  | 'NOT_FOUND'
  | 'AMBIGUOUS_DESTINATION'
  | 'ALLOWLIST_BLOCKED'
  | 'DUPLICATE_BLOCKED'
  | 'FILE_ERROR'
  | 'SLACK_AUTH_ERROR'
  | 'SLACK_RATE_LIMITED'
  | 'SLACK_API_ERROR'
  | 'SLACK_REQUEST_ERROR'
  | 'INTERNAL_ERROR';

export interface ToolErrorShape {
  code: ToolErrorCode;
  message: string;
  hint?: string;
  details?: unknown;
}

export interface ToolSuccessShape<TData> {
  ok: true;
  data: TData;
}

export interface ToolFailureShape {
  ok: false;
  error: ToolErrorShape;
}

export interface UntrustedSlackMessage {
  ts: string;
  user?: string;
  text?: string;
  subtype?: string;
  threadTs?: string;
  untrustedRemoteContent: true;
}

export interface SlackHistoryPage {
  channelId: string;
  messages: UntrustedSlackMessage[];
  hasMore: boolean;
  nextCursor?: string;
}

export interface DuplicateAttempt {
  key: string;
  destinationId: string;
  summary: string;
  createdAt: number;
  reason: string;
}
