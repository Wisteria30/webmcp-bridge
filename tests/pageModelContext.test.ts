import { describe, expect, it } from "vitest";

import {
  normalizeCallResult,
  normalizePageTool,
  toolListSignature,
} from "../src/pageModelContext.js";

describe("normalizePageTool", () => {
  it("parses a JSON-string inputSchema (Chrome native shape)", () => {
    const tool = normalizePageTool({
      name: "give_clue",
      description: "give a clue",
      inputSchema: '{"type":"object","properties":{"word":{"type":"string"}}}',
    });

    expect(tool.inputSchema).toEqual({
      type: "object",
      properties: { word: { type: "string" } },
    });
  });

  it("passes through an object inputSchema (spec shape)", () => {
    const schema = { type: "object", properties: {} };
    expect(normalizePageTool({ name: "t", description: "", inputSchema: schema }).inputSchema).toBe(
      schema,
    );
  });

  it("fills an explicit empty schema when the page omits inputSchema", () => {
    expect(normalizePageTool({ name: "t", description: "" }).inputSchema).toEqual({
      type: "object",
      properties: {},
    });
  });

  it("throws explicitly for nameless or malformed tools", () => {
    expect(() => normalizePageTool({ description: "no name" })).toThrow();
    expect(() => normalizePageTool("not an object")).toThrow();
    expect(() => normalizePageTool({ name: "t", inputSchema: "{broken json" })).toThrow();
  });
});

describe("normalizeCallResult", () => {
  it("parses a CallToolResult JSON string (native executeTool shape)", () => {
    const result = normalizeCallResult('{"content":[{"type":"text","text":"ok"}]}');

    expect(result).toEqual({ content: [{ type: "text", text: "ok" }] });
  });

  it("wraps plain text (registerWebMcp shim shape) into text content", () => {
    const result = normalizeCallResult("current state:\n{...}");

    expect(result).toEqual({ content: [{ type: "text", text: "current state:\n{...}" }] });
  });

  it("passes through an object that already has a content array", () => {
    const value = { content: [{ type: "text", text: "x" }], isError: true };
    expect(normalizeCallResult(value)).toBe(value);
  });

  it("wraps other JSON values into text content", () => {
    expect(normalizeCallResult('{"answer":42}')).toEqual({
      content: [{ type: "text", text: '{"answer":42}' }],
    });
  });
});

describe("toolListSignature", () => {
  it("is order-insensitive over tool names", () => {
    expect(toolListSignature([{ name: "b" }, { name: "a" }])).toBe(
      toolListSignature([{ name: "a" }, { name: "b" }]),
    );
  });

  it("changes when the tool set changes", () => {
    expect(toolListSignature([{ name: "a" }])).not.toBe(
      toolListSignature([{ name: "a" }, { name: "b" }]),
    );
  });
});
