// ページ内 WebMCP(modelContext)との契約。
// ページ側で評価する式は「生の値を取り出す」ことに限定し、
// 形の正規化はブリッジ側(この module の純関数)で行う。テスト可能にするため。

import type { CallToolResult, Tool } from "@modelcontextprotocol/server";

import type { CdpConnection } from "./cdpConnection.js";

export type PageTool = Tool;
export type PageCallResult = CallToolResult;
export type PageLocation = { origin: string };

// toolchange イベントをブリッジプロセスへ届けるための CDP binding 名。
// index.ts の Runtime.addBinding と TOOLCHANGE_LISTENER_EXPR の両方で使うため、ここで一元管理する。
export const TOOLCHANGE_BINDING = "__webmcpBridgeToolchange";

// WebMCP は API が navigator.modelContext から document.modelContext へ移行中(2026-07 の仕様改訂)。
// 両方を探すのは移行期の仕様互換であり、フォールバック実装ではない。
const MODEL_CONTEXT_EXPR =
  "(document.modelContext !== undefined ? document.modelContext : navigator.modelContext)";

const LIST_TOOLS_EXPR = `(async () => {
  const mc = ${MODEL_CONTEXT_EXPR};
  if (mc === undefined) throw new Error("this page has no WebMCP (modelContext) support");
  const tools = await mc.getTools();
  return tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
})()`;

const PAGE_LOCATION_EXPR = `({ origin: location.origin })`;

// 仕様ドラフトの executeTool は inputObject(object)を取るが、Chrome 151 の実装は
// JSON 文字列しか受け付けない(object を渡すと "Failed to parse input arguments"。2026-08 実測)。
// 実装に合わせて文字列で渡す。Chrome が仕様に追従したら見直すこと。
function executeToolExpr(name: string, args: unknown): string {
  return `(async () => {
    const mc = ${MODEL_CONTEXT_EXPR};
    if (mc === undefined) throw new Error("this page has no WebMCP (modelContext) support");
    const tools = await mc.getTools();
    const tool = tools.find((t) => t.name === ${JSON.stringify(name)});
    if (tool === undefined) throw new Error("tool not found on page: " + ${JSON.stringify(name)});
    return await mc.executeTool(tool, ${JSON.stringify(JSON.stringify(args))});
  })()`;
}

// WebMCP 仕様の toolchange イベント(ツールの登録・解除で発火)をブリッジへ中継するリスナー。
// document 単位で 1 回だけ設置する(ハードナビゲーション後は index.ts が張り直す)。
export const TOOLCHANGE_LISTENER_EXPR = `(() => {
  const mc = ${MODEL_CONTEXT_EXPR};
  if (mc === undefined) throw new Error("this page has no WebMCP (modelContext) support");
  if (globalThis.${TOOLCHANGE_BINDING}Installed === true) return "already";
  globalThis.${TOOLCHANGE_BINDING}Installed = true;
  mc.addEventListener("toolchange", () => {
    globalThis.${TOOLCHANGE_BINDING}("toolchange");
  });
  return "installed";
})()`;

// Chrome ネイティブの getTools() は inputSchema を JSON 文字列で返す(2026-08 時点の実測)。
// 仕様上の object 形と両方受け付け、それ以外は明確に失敗させる。
export function normalizePageTool(raw: unknown): PageTool {
  if (raw === null || typeof raw !== "object") {
    throw new Error(`unexpected tool shape from page: ${JSON.stringify(raw)}`);
  }
  const tool = raw as { name?: unknown; description?: unknown; inputSchema?: unknown };
  if (typeof tool.name !== "string" || tool.name.length === 0) {
    throw new Error(`tool from page has no name: ${JSON.stringify(raw)}`);
  }
  let inputSchema: Record<string, unknown>;
  if (typeof tool.inputSchema === "string") {
    inputSchema = JSON.parse(tool.inputSchema) as Record<string, unknown>;
  } else if (tool.inputSchema !== null && typeof tool.inputSchema === "object") {
    inputSchema = tool.inputSchema as Record<string, unknown>;
  } else if (tool.inputSchema === undefined || tool.inputSchema === null) {
    // WebMCP では inputSchema 省略可。MCP クライアントには「引数なし」を明示する。
    inputSchema = { type: "object", properties: {} };
  } else {
    throw new Error(`tool "${tool.name}" has an unusable inputSchema: ${String(tool.inputSchema)}`);
  }
  // MCP の tool inputSchema は type: "object" が必須。それ以外はページ側の契約違反。
  if (inputSchema.type !== "object") {
    throw new Error(
      `tool "${tool.name}" inputSchema.type must be "object", got: ${JSON.stringify(inputSchema.type)}`,
    );
  }
  return {
    name: tool.name,
    description: typeof tool.description === "string" ? tool.description : "",
    inputSchema: inputSchema as PageTool["inputSchema"],
  };
}

// ネイティブ executeTool の戻り値は 2 形態ある(2026-08 時点の実測):
//  (a) ツールが CallToolResult を返した場合 → その JSON 文字列(または object)
//  (b) ツールが平文テキストを返した場合(registerWebMcp のシム等)→ テキストそのもの
export function normalizeCallResult(raw: unknown): PageCallResult {
  if (typeof raw === "string") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (_error) {
      // JSON でなければ (b) の平文テキスト。そのまま content に包む。
      return { content: [{ type: "text", text: raw }] };
    }
    return normalizeCallResult(parsed);
  }
  if (raw !== null && typeof raw === "object" && Array.isArray((raw as PageCallResult).content)) {
    return raw as PageCallResult;
  }
  return { content: [{ type: "text", text: JSON.stringify(raw) }] };
}

export function toolListSignature(tools: ReadonlyArray<{ name: string }>): string {
  return tools
    .map((tool) => tool.name)
    .sort()
    .join(",");
}

export async function listPageTools(cdp: CdpConnection): Promise<PageTool[]> {
  const raw = await cdp.evaluate(LIST_TOOLS_EXPR);
  if (!Array.isArray(raw)) {
    throw new Error(`page returned a non-array tool list: ${JSON.stringify(raw)}`);
  }
  return raw.map(normalizePageTool);
}

export async function getPageLocation(cdp: CdpConnection): Promise<PageLocation> {
  const raw = await cdp.evaluate(PAGE_LOCATION_EXPR);
  if (raw === null || typeof raw !== "object") {
    throw new Error(`page returned an invalid location: ${JSON.stringify(raw)}`);
  }
  const location = raw as { origin?: unknown };
  if (typeof location.origin !== "string") {
    throw new Error(`page returned an invalid location: ${JSON.stringify(raw)}`);
  }
  return { origin: location.origin };
}

export async function executePageTool(
  cdp: CdpConnection,
  name: string,
  args: unknown,
): Promise<PageCallResult> {
  const raw = await cdp.evaluate(executeToolExpr(name, args));
  return normalizeCallResult(raw);
}
