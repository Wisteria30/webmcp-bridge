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
    ["set_team_role", "role_required"],
    ["give_clue", "spymaster_turn"],
    ["select_card", "operative_turn"],
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
});
