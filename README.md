# PUYU Slack MCP

Local MCP stdio server for safer Slack reads, alias-based writes, and file uploads in PUYU workflows.

## What it exposes

The server registers these MCP tools:

| Tool | Purpose |
|---|---|
| `slack_resolve_alias` | Resolve a local alias to a Slack DM/channel destination. |
| `slack_send_message` | Send text to a DM, channel, or thread. |
| `slack_upload_file` | Upload a local file with optional comment. |
| `slack_upload_last_prompt_image` | Upload the latest prompt image captured by the local OpenCode plugin. |
| `slack_history` | Read recent messages from a DM or channel. |
| `slack_thread` | Read thread replies. |
| `slack_search_users` | Search Slack users by name/email. |
| `slack_list_channels` | List channels and direct conversations. |
| `slack_alias_upsert` | Create/update a local alias with overwrite protection. |

## Required environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `SLACK_TOKEN` | For Slack API-backed tools | — | Accepts `xoxb` or `xoxp`. Missing token fails safely at tool runtime. |
| `SLACK_ALIAS_PATH` | No | `~/.config/opencode/slack/aliases.json` | Local JSON alias registry. |
| `SLACK_DRY_RUN` | No | `false` | When true, write tools resolve destination but do not call Slack. |
| `SLACK_ALLOWED_CONVERSATIONS` | No | empty | Optional comma-separated channel/DM allowlist for writes. |
| `SLACK_DUPLICATE_WINDOW_MS` | No | `300000` | Window for blocking repeats after uncertain write failures. |
| `SLACK_MAX_UPLOAD_BYTES` | No | `20971520` | Local upload size limit in bytes. |
| `OPENCODE_IMAGE_MANIFEST_PATH` | No | `/tmp/puyu-slack-mcp/opencode-attachments/latest.json` | Override where the OpenCode plugin writes the latest captured prompt image manifest. |

## Slack scopes

| Tool area | Likely scopes |
|---|---|
| Message send | `chat:write` |
| File upload | `files:write`, `chat:write` |
| History / thread reads | `channels:history`, `groups:history`, `im:history`, `mpim:history` |
| User search | `users:read`, `users:read.email` |
| Channel listing | `channels:read`, `groups:read`, `im:read`, `mpim:read` |

## Safety behavior

- Writes never happen outside MCP tools.
- Ambiguous or missing destinations are blocked before Slack API access.
- `SLACK_DRY_RUN=true` returns the intended payload instead of sending.
- Optional allowlist enforcement blocks writes to unknown conversation IDs.
- Duplicate-send guard blocks retries after recent uncertain outcomes.
- Slack read content is returned as **untrusted remote content**.

## Local usage

```bash
npm install
npm test
```

Run the stdio server locally:

```bash
npm start
```

## OpenCode config example

See [`docs/opencode.example.json`](docs/opencode.example.json) and [`docs/aliases.example.json`](docs/aliases.example.json).

## Prompt image upload flow

`slack_upload_last_prompt_image` only works when the local OpenCode plugin captures the REAL pasted attachment bytes. The `[Image 1]` placeholder text alone is NOT enough.

Quick path:

1. Add the project plugin at [`.opencode/plugins/prompt-image-bridge.js`](.opencode/plugins/prompt-image-bridge.js).
2. Paste an image into an OpenCode prompt so the plugin can write files under `/tmp/puyu-slack-mcp/opencode-attachments/...`.
3. Call `slack_upload_last_prompt_image` with the same destination inputs you already use for `slack_upload_file`.

The plugin updates a manifest file with the latest captured image. The MCP tool reads that manifest, validates the local file, and then reuses the normal Slack file upload path.

See [`docs/prompt-image-upload.md`](docs/prompt-image-upload.md) for limitations and fallback options.

## Notes

- Alias registry writes are atomic and keep the JSON shape compatible with the existing OpenCode alias file.
- The server is local-only and does not create GitHub artifacts.
- See [`docs/PRD.md`](docs/PRD.md) for the original product framing.
