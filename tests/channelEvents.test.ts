import { describe, expect, it } from "vitest";

import { ChannelEventTracker } from "../src/channelEvents.js";

describe("ChannelEventTracker", () => {
  it("does not notify for the initial tool snapshot", () => {
    const tracker = new ChannelEventTracker();

    tracker.seed(["report_for_duty"]);

    expect(tracker.observe(["report_for_duty"])).toBeNull();
  });

  it("does not overwrite the snapshot when the client lists tools after a change", () => {
    const tracker = new ChannelEventTracker();
    tracker.seed(["report_for_duty"]);
    tracker.seed(["get_game_state", "join_room"]);

    expect(tracker.observe(["get_game_state", "join_room"])).toMatchObject({
      kind: "room_ready",
    });
  });

  it.each([
    ["join_room", "room_ready"],
    ["give_clue", "spymaster_turn"],
    ["select_card", "operative_turn"],
    ["wait_for_post_game_message", "game_finished"],
    ["post_game_message_pending", "post_game_message"],
  ] as const)("maps newly added %s to %s", (toolName, eventKind) => {
    const tracker = new ChannelEventTracker();
    tracker.observe(["get_game_state"]);

    expect(tracker.observe(["get_game_state", toolName])).toMatchObject({
      kind: eventKind,
      toolName,
    });
  });

  it("does not notify when action tools are only removed or retained", () => {
    const tracker = new ChannelEventTracker();
    tracker.observe(["get_game_state", "select_card"]);

    expect(tracker.observe(["get_game_state", "select_card"])).toBeNull();
    expect(tracker.observe(["get_game_state"])).toBeNull();
  });

  it("notifies again when the same action tool returns on a later turn", () => {
    const tracker = new ChannelEventTracker();
    tracker.observe(["get_game_state"]);
    tracker.observe(["get_game_state", "select_card"]);
    tracker.observe(["get_game_state"]);

    expect(tracker.observe(["get_game_state", "select_card"])).toMatchObject({
      kind: "operative_turn",
    });
  });

  it("notifies when a waiting agent reaches the finished game scene", () => {
    const tracker = new ChannelEventTracker();
    tracker.observe(["get_game_state", "get_rules", "wait_for_my_turn"]);

    expect(
      tracker.observe([
        "get_game_state",
        "get_rules",
        "send_post_game_message",
        "wait_for_post_game_message",
      ]),
    ).toMatchObject({
      kind: "game_finished",
      toolName: "wait_for_post_game_message",
    });
  });

  it("prioritizes an unanswered post-game question over the game-finished event", () => {
    const tracker = new ChannelEventTracker();
    tracker.observe(["get_game_state", "get_rules", "wait_for_my_turn"]);

    const event = tracker.observe([
      "get_game_state",
      "get_rules",
      "set_post_game_typing",
      "send_post_game_message",
      "wait_for_post_game_message",
      "post_game_message_pending",
    ]);

    expect(event).toMatchObject({
      kind: "post_game_message",
      toolName: "post_game_message_pending",
    });
    expect(event?.content).toContain("must reply when the post @mentions you");
    expect(event?.content).toContain("set_post_game_typing");
    expect(event?.content).toContain("send nothing");
  });
});
