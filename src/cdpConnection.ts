// Chrome DevTools Protocol への接続。タブの発見と Runtime.evaluate だけを提供する。
// 接続先は 127.0.0.1 のみ(利用者自身の Chrome)。リモートホストには接続しない。

type CdpTab = {
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type EvaluatePayload = {
  result?: { value?: unknown };
  exceptionDetails?: { text: string; exception?: { description?: string } };
};

async function discoverTab(cdpPort: number, targetUrlFilter: string | null): Promise<CdpTab> {
  let tabs: CdpTab[];
  try {
    const response = await fetch(`http://127.0.0.1:${cdpPort}/json`);
    tabs = (await response.json()) as CdpTab[];
  } catch (error) {
    throw new Error(
      `Cannot reach the Chrome CDP endpoint (127.0.0.1:${cdpPort}). ` +
        `Start Chrome with --remote-debugging-port=${cdpPort}: ${String(error)}`,
    );
  }
  const pages = tabs.filter((tab) => tab.type === "page");
  const tab =
    targetUrlFilter === null
      ? pages[0]
      : pages.find((candidate) => candidate.url.includes(targetUrlFilter));
  if (tab === undefined) {
    const filterNote = targetUrlFilter === null ? "" : ` (URL filter: ${targetUrlFilter})`;
    throw new Error(
      `No matching tab found${filterNote}. Open tabs: ${pages.map((p) => p.url).join(", ")}`,
    );
  }
  return tab;
}

export class CdpConnection {
  private readonly ws: WebSocket;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly eventHandlers = new Map<string, (params: unknown) => void>();
  private nextId = 1;
  readonly tabUrl: string;

  private constructor(ws: WebSocket, tabUrl: string) {
    this.ws = ws;
    this.tabUrl = tabUrl;
    this.ws.addEventListener("message", (event) => {
      this.handleMessage(String(event.data));
    });
  }

  static async connect(
    cdpPort: number,
    targetUrlFilter: string | null,
    onClose: () => void,
  ): Promise<CdpConnection> {
    const tab = await discoverTab(cdpPort, targetUrlFilter);
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("open", () => resolve());
      ws.addEventListener("error", () =>
        reject(new Error(`Cannot connect to the CDP WebSocket: ${tab.webSocketDebuggerUrl}`)),
      );
    });
    ws.addEventListener("close", onClose);
    return new CdpConnection(ws, tab.url);
  }

  // CDP コマンドを送り、応答を待つ。
  send(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  // CDP イベント(id を持たないメッセージ)の購読。イベント種別ごとに 1 ハンドラ。
  onEvent(method: string, handler: (params: unknown) => void): void {
    this.eventHandlers.set(method, handler);
  }

  // ページ内で式を評価して JSON 値として受け取る。ページ側の例外は Error として伝播する。
  async evaluate(expression: string): Promise<unknown> {
    const payload = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    const evaluated = payload as EvaluatePayload;
    if (evaluated.exceptionDetails !== undefined) {
      const description =
        evaluated.exceptionDetails.exception?.description ?? evaluated.exceptionDetails.text;
      throw new Error(`In-page evaluation failed: ${description}`);
    }
    return evaluated.result?.value;
  }

  private handleMessage(data: string): void {
    let message: {
      id?: number;
      method?: string;
      params?: unknown;
      result?: unknown;
      error?: { message: string };
    };
    try {
      message = JSON.parse(data);
    } catch (error) {
      console.error("[webmcp-bridge] unparsable CDP message:", error);
      return;
    }
    if (message.id === undefined) {
      if (message.method !== undefined) {
        this.eventHandlers.get(message.method)?.(message.params);
      }
      return;
    }
    const pending = this.pending.get(message.id);
    if (pending === undefined) {
      return;
    }
    this.pending.delete(message.id);
    if (message.error !== undefined) {
      pending.reject(new Error(`CDP error: ${message.error.message}`));
    } else {
      pending.resolve(message.result);
    }
  }
}
