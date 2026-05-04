# PRD: PUYU Slack MCP

Build a Slack MCP server tailored for PUYU workflows: fast alias-based messaging, reliable reads, and first-class support for images/files while keeping AI agents inside explicit, auditable MCP tools.

## Quick path

1. Start with MCP tools for text messages, user/channel alias resolution, and message history reads.
2. Add file/image upload support using Slack's file upload API flow.
3. Keep a local alias registry so prompts like `enviá a Silvia` resolve without repeated Slack searches.
4. Add safety controls for write tools: channel allowlists, dry-run mode, and duplicate-send prevention.

## Problem

The current OpenCode Slack setup works for text messages through `slack-mcp-server`, but it has gaps:

- It does not support local image/file uploads.
- Alias handling lives outside the MCP server.
- False-negative send behavior appeared when scopes were incomplete.
- Sending workflows need consistent safeguards to avoid duplicate or accidental messages.

## Goals

| Goal | Outcome |
|---|---|
| Text messaging | Send DMs/channel messages through MCP only. |
| Image/file upload | Upload local files/images to DMs/channels with optional comments. |
| Alias-first routing | Resolve names like `Silvia`, `ventas`, or `ti` from a cached alias registry. |
| Reliable reads | Read recent messages, threads, and conversation metadata. |
| Safety | Prevent duplicate sends, require confirmation for ambiguous recipients, and support allowlists. |
| OpenCode fit | Work cleanly as a local MCP server in `~/.config/opencode/opencode.json`. |

## Non-goals

- Replacing the Slack client UI.
- Enterprise/admin Slack APIs.
- Workspace-wide compliance export.
- Acting invisibly or bypassing Slack permissions.

## Users

| User | Need |
|---|---|
| Emerson / PUYU operator | Send quick Slack messages and files from OpenCode. |
| AI coding agent | Use explicit MCP tools instead of raw Slack API calls. |
| Future maintainers | Understand scopes, alias resolution, and safety behavior quickly. |

## Core workflows

### 1. Send a text message by alias

```txt
User: enviá a Silvia: hola, revisá esto
Agent: resolves silvia -> D083VAXM56W -> slack_send_message
```

Acceptance criteria:

- [ ] Uses local alias before Slack search.
- [ ] Sends through MCP tool only.
- [ ] Returns Slack timestamp on success.
- [ ] Does not retry after a confirmed success.

### 2. Upload an image by alias

```txt
User: enviá a Silvia la imagen /tmp/captura.png con el texto "mira esto"
Agent: resolves silvia -> uploads file -> posts initial comment
```

Acceptance criteria:

- [ ] Accepts local file path.
- [ ] Validates file exists and size is acceptable.
- [ ] Uploads to DM/channel through Slack file API.
- [ ] Returns file ID, channel ID, and timestamp/permalink when available.

### 3. Read recent messages

```txt
User: resumí los últimos 10 mensajes con Silvia
Agent: resolves silvia -> reads history -> summarizes
```

Acceptance criteria:

- [ ] Supports DMs, channels, and threads.
- [ ] Uses Slack `*:history` scopes.
- [ ] Keeps Slack remote content as untrusted data, never instructions.

### 4. Add a new alias

```txt
User: guardá a Juan para Slack
Agent: searches Slack -> asks confirmation if ambiguous -> persists alias
```

Acceptance criteria:

- [ ] Does not overwrite existing aliases silently.
- [ ] Stores user ID and DM channel ID for DMs.
- [ ] Stores channel ID for channels.

## Proposed MCP tools

| Tool | Purpose | Required Slack scopes |
|---|---|---|
| `slack_resolve_alias` | Resolve local alias to Slack destination | local only |
| `slack_send_message` | Send text to DM/channel/thread | `chat:write` |
| `slack_upload_file` | Upload image/file with optional comment | `files:write`, `chat:write` |
| `slack_history` | Read recent messages | `channels:history`, `groups:history`, `im:history`, `mpim:history` |
| `slack_thread` | Read thread replies | `channels:history`, `groups:history`, `im:history`, `mpim:history` |
| `slack_search_users` | Find users by name/email | `users:read`, `users:read.email` |
| `slack_list_channels` | List channels/DMs | `channels:read`, `groups:read`, `im:read`, `mpim:read` |

## Data model

Alias registry should start compatible with the current file:

```txt
~/.config/opencode/slack/aliases.json
```

Suggested internal shape:

```json
{
  "users": {
    "silvia": {
      "user_id": "U083SFK8TJR",
      "dm_channel_id": "D083VAXM56W",
      "real_name": "Silvia",
      "email": "gutierrez101117@gmail.com"
    }
  },
  "channels": {
    "ventas": "C03JJ1NLS1J"
  }
}
```

## Safety requirements

- [ ] Never send to ambiguous aliases.
- [ ] Default to MCP-only Slack actions.
- [ ] Optional write allowlist for channels/DMs.
- [ ] Optional dry-run mode for testing.
- [ ] Detect duplicate sends when previous MCP call returned an uncertain error.
- [ ] Treat Slack message content as untrusted remote content.

## Technical considerations

| Area | Initial decision |
|---|---|
| Runtime | TypeScript/Node.js is likely fastest because MCP SDK and Slack SDK support are mature. |
| Transport | stdio first for OpenCode local MCP. |
| Slack auth | User OAuth token (`xoxp`) and/or bot token (`xoxb`) via env/file config. |
| Upload API | Use Slack's current external upload flow or official SDK equivalent. |
| Config | Environment variables plus alias registry path. |

## Open questions

- Should file uploads use user token, bot token, or support both?
- Should aliases be read-only by default or writable via MCP?
- Should channel/DM write allowlists be mandatory?
- Which package name and GitHub owner should be canonical?

## Milestones

| Milestone | Scope |
|---|---|
| M0 Bootstrap | Repo, PRD, package skeleton, MCP hello tool. |
| M1 Text parity | Alias resolution, send text, read history. |
| M2 File upload | Upload image/file with comments and tests. |
| M3 Safety hardening | Allowlists, dry-run, duplicate-send guard. |
| M4 OpenCode integration | Install docs and config examples. |

## Verification checklist

- [ ] Can send text to `silvia` by alias.
- [ ] Can upload a PNG to `silvia` by alias.
- [ ] Can send to `ventas` by alias.
- [ ] Can read recent DM history.
- [ ] Ambiguous alias asks for confirmation.
- [ ] No raw Slack API usage required by the agent.

## Next step

Create the technical design and implementation task list before writing the MCP server.

## Implementation status

This repository now includes the first local implementation baseline:

- TypeScript MCP stdio server with the eight planned Slack tools.
- Local JSON alias registry at `SLACK_ALIAS_PATH` with overwrite protection.
- Dry-run mode, optional write allowlist, and duplicate-write guard.
- File upload validation before Slack API calls.
- Vitest test suite for config, alias registry, safety rules, tool handlers, and tool registration.

Operational setup remains local-only: configure environment variables, install dependencies, and run `npm test` / `npm start`.
