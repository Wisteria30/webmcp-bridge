export type ChannelEventKind = "room_ready" | "role_required" | "spymaster_turn" | "operative_turn";

export type ChannelEvent = {
  kind: ChannelEventKind;
  toolName: "join_room" | "set_team_role" | "give_clue" | "select_card";
  content: string;
};

const EVENT_BY_TOOL: Readonly<Record<ChannelEvent["toolName"], ChannelEvent>> = {
  join_room: {
    kind: "room_ready",
    toolName: "join_room",
    content:
      "The Codenames room is ready. Act now without waiting for a human message: call join_room, then inspect the game state and continue setup.",
  },
  set_team_role: {
    kind: "role_required",
    toolName: "set_team_role",
    content:
      "Your Codenames seat is ready for team and role selection. Inspect the game state and use set_team_role as instructed by your human teammate.",
  },
  give_clue: {
    kind: "spymaster_turn",
    toolName: "give_clue",
    content:
      "It is your Codenames spymaster turn. Act now without waiting for a human message: inspect the game state, keep all hidden card information private, and call give_clue.",
  },
  select_card: {
    kind: "operative_turn",
    toolName: "select_card",
    content:
      "It is your Codenames operative turn. Act now without waiting for a human message: inspect the game state and call select_card when you have chosen.",
  },
};

const TOOL_PRIORITY: ReadonlyArray<ChannelEvent["toolName"]> = [
  "join_room",
  "set_team_role",
  "give_clue",
  "select_card",
];

export class ChannelEventTracker {
  private previousToolNames: Set<string> | null = null;

  seed(toolNames: ReadonlyArray<string>): void {
    if (this.previousToolNames === null) {
      this.previousToolNames = new Set(toolNames);
    }
  }

  observe(toolNames: ReadonlyArray<string>): ChannelEvent | null {
    const current = new Set(toolNames);
    const previous = this.previousToolNames;
    this.previousToolNames = current;
    if (previous === null) {
      return null;
    }
    for (const toolName of TOOL_PRIORITY) {
      if (!previous.has(toolName) && current.has(toolName)) {
        return EVENT_BY_TOOL[toolName];
      }
    }
    return null;
  }
}
