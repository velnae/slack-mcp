# @velnae/slack-mcp

OpenCode plugin plus local MCP stdio server for safer Slack reads, alias-based writes, file uploads, and prompt-image handoff.

## Instalación rápida en OpenCode

Agregá el plugin npm y el MCP local en tu `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@velnae/slack-mcp"],
  "mcp": {
    "slack": {
      "type": "local",
      "command": ["npx", "-y", "@velnae/slack-mcp"],
      "enabled": true,
      "environment": {
        "SLACK_TOKEN": "{file:~/.config/opencode/secrets/slack-user-token}",
        "SLACK_ALIAS_PATH": "{env:HOME}/.config/opencode/slack/aliases.json",
        "SLACK_DRY_RUN": "false",
        "OPENCODE_IMAGE_MANIFEST_PATH": "/tmp/puyu-slack-mcp/opencode-attachments/latest.json"
      },
      "timeout": 10000
    }
  }
}
```

> Hoy el plugin npm NO auto-registra el servidor MCP por sí solo. Por eso el bloque `mcp.slack` sigue siendo obligatorio.

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

## Variables de entorno

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

## Desarrollo local

```bash
npm install
npm test
npm run typecheck
```

Run the stdio server locally:

```bash
npm start
```

## Config examples

See [`docs/opencode.example.json`](docs/opencode.example.json) and [`docs/aliases.example.json`](docs/aliases.example.json).

- npm plugin + MCP example: [`docs/opencode.example.json`](docs/opencode.example.json)
- Prompt image details and fallbacks: [`docs/prompt-image-upload.md`](docs/prompt-image-upload.md)
- Local development fallback plugin: [`.opencode/plugins/prompt-image-bridge.js`](.opencode/plugins/prompt-image-bridge.js)

## Package entrypoints

- `@velnae/slack-mcp` → OpenCode plugin entry.
- `@velnae/slack-mcp/server` → reserved OpenCode server-side plugin entry, intentionally mapped to the same plugin target.
- `@velnae/slack-mcp/mcp-server` → importable MCP server module.

The npm CLI/bin stays `npx -y @velnae/slack-mcp`. The MCP server is NOT exposed on the reserved `./server` subpath because OpenCode auto-detects that target as a plugin entry.

## Prompt image upload flow

`slack_upload_last_prompt_image` only works when the local OpenCode plugin captures the REAL pasted attachment bytes. The `[Image 1]` placeholder text alone is NOT enough.

Quick path:

1. Load the npm plugin with `"plugin": ["@velnae/slack-mcp"]`.
2. Keep the `mcp.slack` command pointed at `npx -y @velnae/slack-mcp`.
3. Paste an image into an OpenCode prompt so the plugin can write files under `/tmp/puyu-slack-mcp/opencode-attachments/...`.
4. Call `slack_upload_last_prompt_image` with the same destination inputs you already use for `slack_upload_file`.

The plugin updates a manifest file with the latest captured image. The MCP tool reads that manifest, validates the local file, and then reuses the normal Slack file upload path.

If npm plugin loading is not available in your environment, keep using the local project plugin under `.opencode/plugins/` as a fallback.

See [`docs/prompt-image-upload.md`](docs/prompt-image-upload.md) for limitations and fallback options.

## Notes

- Alias registry writes are atomic and keep the JSON shape compatible with the existing OpenCode alias file.
- The package stays single-repo and single-package: npm plugin entry + MCP bin ship together.
- The repo is still private today, so npm publish and public GitHub visibility are still separate manual release steps.
- See [`docs/PRD.md`](docs/PRD.md) for the original product framing.
