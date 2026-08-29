# webmcp-bridge

Expose [WebMCP](https://github.com/webmachinelearning/webmcp) (`document.modelContext`) tools
from a live Chrome page as a **stdio MCP server**, so CLI agents like Claude Code can play with
the web page you have open — as it is, with its current state. An explicitly enabled Claude Code
Channel mode can also wake a running session when a trusted Codenames action tool becomes available.

```text
Chrome page (WebMCP tools) ⇄ CDP (127.0.0.1) ⇄ webmcp-bridge ⇄ stdio MCP ⇄ Claude Code / Codex CLI / ...
```

The bridge is generic: it works with **any page that registers WebMCP tools**, and only uses the
standard WebMCP API (`getTools()` / `executeTool()` / the `toolchange` event). It never depends on
the testing-only `modelContextTesting` API.

## Requirements

- Chrome 151+ (WebMCP is an experimental API behind a flag / origin trial)
- Node.js 22+ (or Bun)
- An MCP-capable CLI agent (Claude Code, Codex CLI, ...)

## Usage

1. Start Chrome with WebMCP and CDP enabled, and open the page you want to play with.
   The flags only take effect if Chrome is fully quit first:

   ```bash
   # macOS
   open -na "Google Chrome" --args --remote-debugging-port=9222 --enable-features=WebMCPTesting
   ```

   ```bat
   rem Windows
   start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --enable-features=WebMCPTesting
   ```

   ```bash
   # Linux
   google-chrome --remote-debugging-port=9222 --enable-features=WebMCPTesting
   ```

2. Register the bridge with your agent (once):

   ```bash
   # Claude Code
   claude mcp add my-page -- npx -y @wisteria30/webmcp-bridge

   # Codex CLI
   codex mcp add my-page -- npx -y @wisteria30/webmcp-bridge
   ```

   With Bun, use `bunx @wisteria30/webmcp-bridge` instead of `npx -y @wisteria30/webmcp-bridge`.

3. Start your agent. The page's WebMCP tools appear as regular MCP tools.

## Claude Code Channel for Codenames

The repository contains a Claude Code marketplace plugin that starts the bridge with a locked
Codenames origin and emits Channel events for newly available `join_room`, `set_team_role`,
`give_clue`, and `select_card` tools.

```bash
claude plugin marketplace add Wisteria30/webmcp-bridge
claude plugin install codenames-web@wisteria30 --scope user
claude \
  --dangerously-load-development-channels plugin:codenames-web@wisteria30 \
  --allowedTools 'mcp__plugin_codenames-web_codenames-web__*'
```

Claude Code Channels are a research preview. Third-party channels currently require the explicit
development-channel flag even when installed from a marketplace. The `--allowedTools` value grants
only this plugin's WebMCP tools, so room and turn actions do not pause for approval.

Keep the Claude Code session and the dedicated Chrome window open for the duration of the game.

## Configuration

Environment variables (e.g. `claude mcp add my-page --env WEBMCP_BRIDGE_TARGET_URL=example.com -- ...`):

- `WEBMCP_BRIDGE_CDP_PORT`: Chrome's remote debugging port (default `9222`)
- `WEBMCP_BRIDGE_TARGET_URL`: substring filter to pick the target tab by URL when several tabs are
  open (default: the first page tab)
- `WEBMCP_BRIDGE_CHANNEL_ORIGIN`: exact HTTP(S) origin allowed to emit Claude Code Channel events.
  Channel mode is disabled when omitted. Enabling it also requires `WEBMCP_BRIDGE_TARGET_URL`.

## How it works, in one paragraph

The bridge finds your tab through Chrome's DevTools Protocol on `127.0.0.1`, reads the page's
`document.modelContext` (falling back to the older `navigator.modelContext` alias), and serves the
tools over stdio using the official `@modelcontextprotocol/server`. Pages swap tools as their state
changes (state-dependent `tools/list`); the bridge listens to the spec's `toolchange` event, relays
it through a CDP binding, debounces bursts (300 ms), and emits `tools/list_changed` so agents that
follow the notification always see the current tool set. After a hard navigation it reinstalls the
in-page listener automatically.

### Known deviations of Chrome 151 from the spec draft

Both observed in 2026-08; the bridge compensates and should be revisited once Chrome catches up:

- `getTools()` returns `inputSchema` as a JSON **string** instead of an object → parsed back into
  an object
- `executeTool()` rejects the spec's input **object** and requires a JSON string → arguments are
  stringified

`executeTool()`'s return value is normalized from both observed shapes (a stringified
`CallToolResult` or plain text) into a proper MCP `CallToolResult`.

## Security notes

- The bridge only ever connects to `127.0.0.1` — your own Chrome. Nothing is sent anywhere else.
- Anything the page's WebMCP tools can do, your agent can do. Only run the bridge against pages you
  trust, and remember that `--remote-debugging-port` opens local debugging access to your whole
  browser profile — prefer a dedicated Chrome profile if that concerns you.
- Channel mode never forwards page text or tool descriptions. It generates fixed messages only for
  the four allowlisted Codenames action tool names, and suppresses events unless the page origin
  exactly matches `WEBMCP_BRIDGE_CHANNEL_ORIGIN`. Startup, tool listing, and tool calls fail closed
  if the selected tab is on another origin.

## Development

```bash
bun install
bun run lint && bun run typecheck && bun run test && bun run build
```

## Releasing

Publishing is automated with [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/)
(GitHub Actions OIDC — no tokens, provenance attached automatically):

1. Bump `version` in `package.json` and merge to `main`
2. Create a GitHub Release with tag `v<version>` (e.g. `v0.1.1`)
3. Approve the `release` environment deployment when the `publish` workflow asks
   (required-reviewer gate — nothing reaches npm without a human click)
4. The workflow checks, builds, verifies the tag matches `package.json`, and publishes

## License

[MIT](LICENSE)
