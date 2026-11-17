/**
 * The vocabulary of the AI-run table's screen (#1021): what `agent-turn` sends and what the story page draws.
 * The server's contract is in `context/features/agent-runtime.md`; this is its client half.
 */

/** A character's words or deed, as the server hands it over: one character's own call. */
export interface TableLine {
  kind: "spoken" | "acted";
  speaker: { id: string | null; name: string };
  text: string;
  /** Who it was said to, when it was said to someone. */
  to?: string;
}

/** How full the clock the scene runs against is. The page is never told what it counts down to. */
export interface TablePressure {
  filled: number;
  segments: number;
}

export type TableEvent =
  | { type: "session"; sessionId: string; character?: { id: string; name: string } }
  | { type: "text"; delta: string }
  | { type: "tool_start"; name: string }
  | { type: "tool_end"; name: string; isError: boolean }
  | { type: "line"; line: TableLine }
  | { type: "scene"; scene: { id: string; name: string } }
  | { type: "fact"; fact: { id: string; body: string } }
  | { type: "pressure"; pressure: TablePressure | null }
  | { type: "done"; end: string; credits: number; tokens: number }
  | { type: "error"; message: string };

export type PlayMode = "say" | "do";

/** One thing on the story page. The page is a manuscript, so each kind has its own look (Voices frame). */
export type StoryItem =
  | { id: string; kind: "player"; mode: PlayMode; text: string; /** Sent, but the turn was not kept: shown muted until it is sent again. */ unsent?: boolean }
  | { id: string; kind: "narration"; text: string }
  | { id: string; kind: "spoken"; speaker: TableLine["speaker"]; text: string; to?: string }
  | { id: string; kind: "acted"; speaker: TableLine["speaker"]; text: string }
  | { id: string; kind: "margin"; text: string; /** How many times in a row the same quiet line happened. */ count: number };

/** Items other than the player's own never need a speaker; this narrows the two that do. */
export type SpeakerItem = Extract<StoryItem, { kind: "spoken" | "acted" }>;
