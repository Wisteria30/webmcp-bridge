// WebMCP ブリッジの設定。環境変数から読み、不正な値は明確に失敗させる。

export type BridgeConfig = {
  // Chrome の --remote-debugging-port。9222 は Chrome DevTools Protocol の慣例ポート。
  cdpPort: number;
  // 複数タブから対象を選ぶ URL 部分一致フィルタ。未指定なら最初の page タブ。
  targetUrlFilter: string | null;
};

const DEFAULT_CDP_PORT = 9222;

function parsePositiveInt(name: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got: ${raw}`);
  }
  return value;
}

export function loadBridgeConfig(env: Record<string, string | undefined>): BridgeConfig {
  const rawPort = env.WEBMCP_BRIDGE_CDP_PORT;
  const rawTarget = env.WEBMCP_BRIDGE_TARGET_URL;
  return {
    cdpPort:
      rawPort === undefined
        ? DEFAULT_CDP_PORT
        : parsePositiveInt("WEBMCP_BRIDGE_CDP_PORT", rawPort),
    targetUrlFilter: rawTarget === undefined || rawTarget === "" ? null : rawTarget,
  };
}
