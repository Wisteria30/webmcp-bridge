# Codenames Web Channel

This Claude Code plugin starts `@wisteria30/webmcp-bridge` in Codenames Channel mode. It exposes
the current page's WebMCP tools and pushes a Channel event when a room is ready, an agent turn
begins, a game ends, or a post-game question arrives.

During the Claude Code Channels research preview, third-party channels require the explicit
development-channel flag even when installed from a marketplace:

```bash
claude --dangerously-load-development-channels plugin:codenames-web@wisteria30
```

The plugin accepts Channel events only from `https://codenames.kakka.workers.dev`.
