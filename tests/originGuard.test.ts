import { describe, expect, it } from "vitest";

import type { CdpConnection } from "../src/cdpConnection.js";
import { executePageTool, listPageTools } from "../src/pageModelContext.js";

function recordingConnection(result: unknown): {
  cdp: CdpConnection;
  expressions: string[];
} {
  const expressions: string[] = [];
  const cdp = {
    evaluate: (expression: string) => {
      expressions.push(expression);
      return Promise.resolve(result);
    },
  } as unknown as CdpConnection;
  return { cdp, expressions };
}

describe("Channel origin guard", () => {
  it("checks the origin in the same evaluation that lists page tools", async () => {
    const { cdp, expressions } = recordingConnection([]);

    await listPageTools(cdp, "https://codenames.example");

    expect(expressions).toHaveLength(1);
    expect(expressions[0]).toContain('location.origin !== "https://codenames.example"');
    expect(expressions[0]).toContain("await mc.getTools()");
  });

  it("checks the origin in the same evaluation that executes a page tool", async () => {
    const { cdp, expressions } = recordingConnection("ok");

    await executePageTool(cdp, "join_room", {}, "https://codenames.example");

    expect(expressions).toHaveLength(1);
    expect(expressions[0]).toContain('location.origin !== "https://codenames.example"');
    expect(expressions[0]).toContain("return await mc.executeTool");
  });
});
