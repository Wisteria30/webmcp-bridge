#!/usr/bin/env node
// WebMCP ブリッジ: Chrome のページに登録された WebMCP(modelContext)ツールを、
// stdio MCP サーバーとして CLI エージェント(Claude Code 等)へ公開する。
//
// 使い方(README.md):
//   1. Chrome を --remote-debugging-port=9222 --enable-features=WebMCPTesting で起動し、対象ページを開く
//   2. claude mcp add my-page -- npx -y @wisteria30/webmcp-bridge
//
// 環境変数: WEBMCP_BRIDGE_CDP_PORT / WEBMCP_BRIDGE_TARGET_URL

import { createRequire } from "node:module";

import { Server } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { loadBridgeConfig } from "./bridgeConfig.js";
import { CdpConnection } from "./cdpConnection.js";
import {
  executePageTool,
  listPageTools,
  TOOLCHANGE_BINDING,
  TOOLCHANGE_LISTENER_EXPR,
} from "./pageModelContext.js";

// registerWebMcp の refresh は全ツールを掛け替えるため、toolchange は一斉に連発する。
// 1 回の掛け替えを 1 通知にまとめる(仕様のイベントを起点にした coalescing)。
const TOOLCHANGE_DEBOUNCE_MS = 300;

// パッケージの version を MCP の serverInfo と二重管理しないため、package.json から読む。
const require = createRequire(import.meta.url);
const { version: BRIDGE_VERSION } = require("../package.json") as { version: string };

function log(message: string): void {
  // stdout は MCP のトランスポートなので、ログは必ず stderr へ。
  process.stderr.write(`[webmcp-bridge] ${message}\n`);
}

async function main(): Promise<void> {
  const config = loadBridgeConfig(process.env);
  const cdp = await CdpConnection.connect(config.cdpPort, config.targetUrlFilter, () => {
    log("CDP connection closed (tab closed, Chrome quit, ...). Exiting.");
    process.exit(1);
  });
  log(`connected to: ${cdp.tabUrl}`);

  const server = new Server(
    { name: "webmcp-bridge", version: BRIDGE_VERSION },
    {
      capabilities: { tools: { listChanged: true } },
      instructions:
        "This server relays the WebMCP tools of the page currently open in the browser. " +
        "The tool list changes with the page state: refetch it whenever you receive a " +
        "tools/list_changed notification.",
    },
  );

  server.setRequestHandler("tools/list", async () => ({
    tools: await listPageTools(cdp),
  }));

  server.setRequestHandler("tools/call", async (request) => {
    const args = request.params.arguments === undefined ? {} : request.params.arguments;
    return await executePageTool(cdp, request.params.name, args);
  });

  // ページのツール掛け替え(状態依存 tools/list)は、WebMCP 仕様の toolchange イベントで検出する。
  // ページ内リスナー → CDP binding → このプロセス、の順に届く。
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const notifyToolListChanged = () => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      log("notifying tool list change");
      server.sendToolListChanged().catch((error: unknown) => {
        log(`failed to send tools/list_changed: ${String(error)}`);
      });
    }, TOOLCHANGE_DEBOUNCE_MS);
  };

  cdp.onEvent("Runtime.bindingCalled", (params) => {
    if ((params as { name?: string }).name === TOOLCHANGE_BINDING) {
      notifyToolListChanged();
    }
  });
  // ページ全体の再読み込み(SPA 内遷移ではなくハードナビゲーション)ではリスナーが失われる。
  // メインフレームの遷移を検知してリスナーを張り直し、ツールも変わったものとして通知する。
  cdp.onEvent("Page.frameNavigated", (params) => {
    const frame = (params as { frame?: { parentId?: string } }).frame;
    if (frame?.parentId !== undefined) {
      return;
    }
    cdp
      .evaluate(TOOLCHANGE_LISTENER_EXPR)
      .then(() => notifyToolListChanged())
      .catch((error: unknown) => {
        log(`failed to reinstall the toolchange listener after navigation: ${String(error)}`);
      });
  });

  await cdp.send("Runtime.enable", {});
  await cdp.send("Page.enable", {});
  await cdp.send("Runtime.addBinding", { name: TOOLCHANGE_BINDING });
  await cdp.evaluate(TOOLCHANGE_LISTENER_EXPR);

  serveStdio(() => server, {
    onerror: (error) => log(`MCP server error: ${error.message}`),
  });
  log("stdio MCP server started");
}

main().catch((error: unknown) => {
  log(`startup failed: ${String(error)}`);
  process.exit(1);
});
