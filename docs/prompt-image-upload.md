# Prompt image upload bridge

This project can upload the LAST image you pasted into an OpenCode prompt, but ONLY if the local plugin captured the attachment event bytes.

## Quick path

1. Enable the project plugin: `.opencode/plugins/prompt-image-bridge.js`
2. Paste an image into the OpenCode prompt.
3. Let the plugin write `/tmp/puyu-slack-mcp/opencode-attachments/latest.json`.
4. Call `slack_upload_last_prompt_image`.

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
