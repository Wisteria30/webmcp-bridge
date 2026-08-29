// WebMCP ブリッジの設定。環境変数から読み、不正な値は明確に失敗させる。

export type BridgeConfig = {
  // Chrome の --remote-debugging-port。9222 は Chrome DevTools Protocol の慣例ポート。
  cdpPort: number;
  // 複数タブから対象を選ぶ URL 部分一致フィルタ。未指定なら最初の page タブ。
  targetUrlFilter: string | null;
  // Claude Code Channel 通知を許可する完全一致 origin。未指定なら Channel は無効。
  channelOrigin: string | null;
};

const DEFAULT_CDP_PORT = 9222;

function parsePositiveInt(name: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got: ${raw}`);
  }
  return value;
}

function parseOrigin(name: string, raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} must be an absolute HTTP(S) origin, got: ${raw}`);
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(`${name} must contain only an HTTP(S) origin, got: ${raw}`);
  }
  return url.origin;
}

export function loadBridgeConfig(env: Record<string, string | undefined>): BridgeConfig {
  const rawPort = env.WEBMCP_BRIDGE_CDP_PORT;
  const rawTarget = env.WEBMCP_BRIDGE_TARGET_URL;
  const rawChannelOrigin = env.WEBMCP_BRIDGE_CHANNEL_ORIGIN;
  const channelOrigin =
    rawChannelOrigin === undefined || rawChannelOrigin === ""
      ? null
      : parseOrigin("WEBMCP_BRIDGE_CHANNEL_ORIGIN", rawChannelOrigin);
  if (channelOrigin !== null && (rawTarget === undefined || rawTarget === "")) {
    throw new Error(
      "WEBMCP_BRIDGE_TARGET_URL is required when WEBMCP_BRIDGE_CHANNEL_ORIGIN is set",
    );
  }
  return {
    cdpPort:
      rawPort === undefined
        ? DEFAULT_CDP_PORT
        : parsePositiveInt("WEBMCP_BRIDGE_CDP_PORT", rawPort),
    targetUrlFilter: rawTarget === undefined || rawTarget === "" ? null : rawTarget,
    channelOrigin,
  };
}
