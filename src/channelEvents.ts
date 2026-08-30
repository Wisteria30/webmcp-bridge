export type ChannelEventKind =
  | "room_ready"
  | "spymaster_turn"
  | "operative_turn"
  | "game_finished"
  | "post_game_message";

export type ChannelEvent = {
  kind: ChannelEventKind;
  toolName:
    | "join_room"
    | "give_clue"
    | "select_card"
    | "wait_for_post_game_message"
    | "post_game_message_pending";
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
      "A human posted in the Codenames post-game group chat. Act now without waiting for another human prompt: call post_game_message_pending. You must reply when the post @mentions you. Otherwise, decide whether joining would make the group conversation more fun or useful. If replying, call set_post_game_typing with true before composing, then send_post_game_message. If not replying, send nothing and wait for the next post.",
  },
  wait_for_post_game_message: {
    kind: "game_finished",
    toolName: "wait_for_post_game_message",
    content:
      "The Codenames game has finished. Act now without waiting for a human message: inspect the final game state, acknowledge the result, then call wait_for_post_game_message with cursor 0 to keep this session available for post-game questions.",
  },
};

const TOOL_PRIORITY: ReadonlyArray<ChannelEvent["toolName"]> = [
  "join_room",
  "give_clue",
  "select_card",
  "post_game_message_pending",
  "wait_for_post_game_message",
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
