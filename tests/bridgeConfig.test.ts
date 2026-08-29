import { describe, expect, it } from "vitest";

import { loadBridgeConfig } from "../src/bridgeConfig.js";

describe("loadBridgeConfig", () => {
  it("keeps Claude Channel disabled unless an origin is explicit", () => {
    expect(loadBridgeConfig({})).toEqual({
      cdpPort: 9222,
      targetUrlFilter: null,
      channelOrigin: null,
    });
  });

  it("enables Channel only with an exact HTTP(S) origin and target", () => {
    expect(
      loadBridgeConfig({
        WEBMCP_BRIDGE_TARGET_URL: "https://codenames.example/",
        WEBMCP_BRIDGE_CHANNEL_ORIGIN: "https://codenames.example/",
      }),
    ).toMatchObject({
      targetUrlFilter: "https://codenames.example/",
      channelOrigin: "https://codenames.example",
    });
  });

  it.each([
    "https://codenames.example/path",
    "https://user@example.com/",
    "file:///tmp/page.html",
    "not-a-url",
  ])("rejects non-origin Channel value %s", (origin) => {
    expect(() =>
      loadBridgeConfig({
        WEBMCP_BRIDGE_TARGET_URL: "codenames.example",
        WEBMCP_BRIDGE_CHANNEL_ORIGIN: origin,
      }),
    ).toThrow("must");
  });

  it("requires a target filter when Channel is enabled", () => {
    expect(() =>
      loadBridgeConfig({ WEBMCP_BRIDGE_CHANNEL_ORIGIN: "https://codenames.example" }),
    ).toThrow("WEBMCP_BRIDGE_TARGET_URL is required");
  });
});
