# Prompt image upload bridge

This package can upload the LAST image you pasted into an OpenCode prompt, but ONLY if the OpenCode plugin captured the attachment event bytes.

## Quick path

1. Add `"plugin": ["@velnae/slack-mcp"]` to your OpenCode config.
2. Configure the Slack MCP server with `"command": ["npx", "-y", "@velnae/slack-mcp"]`.
3. Paste an image into the OpenCode prompt.
4. Let the plugin write `/tmp/puyu-slack-mcp/opencode-attachments/latest.json`.
5. Call `slack_upload_last_prompt_image`.

> The npm plugin currently handles prompt-image capture only. Keep the `mcp.slack` block in config as the runtime fallback for the actual Slack MCP server.

## OpenCode config example

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

## Local plugin fallback

Use the checked-in local plugin when you are developing this repository or when npm plugin loading is unavailable:

```txt
.opencode/plugins/prompt-image-bridge.js
.opencode/plugins/lib/prompt-image-capture.js
```

You still need the same `mcp.slack` block shown above.

## Why this exists

OpenCode usually shows pasted images in chat as placeholders like `[Image 1]`.

That placeholder is ONLY text from the MCP server point of view.

So the Slack MCP cannot upload the real image unless something local captures the attachment bytes first.

## What the plugin does

| Step | Result |
|---|---|
| Listen to `message.updated` / `message.part.updated` | Sees raw OpenCode event payloads when available |
| Detect image/file parts defensively | Supports likely fields like `data`, `base64`, `content`, `source` |
| Save bytes to `/tmp/puyu-slack-mcp/opencode-attachments/...` | Produces a real local file path |
| Update `latest.json` | Gives MCP a stable handoff point |

## Limitations

- `[Image 1]` by itself is NOT uploadable.
- If OpenCode event payloads do not expose image bytes, the plugin can only log diagnostics.
- The temp file may disappear between capture and upload.
- This tool only uploads the MOST RECENT captured image.

## Fallbacks

- Use `slack_upload_file` with a known local file path.
- Save the image manually, then upload it.
- Use OS clipboard/image capture tooling if OpenCode does not expose attachment bytes in events.
