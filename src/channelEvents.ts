export type ChannelEventKind =
  | "room_ready"
  | "spymaster_turn"
  | "operative_turn"
  | "post_game_message";

export type ChannelEvent = {
  kind: ChannelEventKind;
  toolName: "join_room" | "give_clue" | "select_card" | "post_game_message_pending";
  content: string;
};

const EVENT_BY_TOOL: Readonly<Record<ChannelEvent["toolName"], ChannelEvent>> = {
  join_room: {
    kind: "room_ready",
    toolName: "join_room",
    content:
      "The Codenames room is ready. Act now without waiting for a human message: call join_room, then inspect the game state and continue setup.",
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
  post_game_message_pending: {
    kind: "post_game_message",
    toolName: "post_game_message_pending",
    content:
      "A human sent you a private Codenames post-game question. Act now without waiting for another human prompt: call post_game_message_pending, answer each sender with send_post_game_message, then wait for the next question with wait_for_post_game_message.",
  },
};

const TOOL_PRIORITY: ReadonlyArray<ChannelEvent["toolName"]> = [
  "join_room",
  "give_clue",
  "select_card",
  "post_game_message_pending",
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
