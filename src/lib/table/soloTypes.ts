import type { Shown } from "@edge-shared/agent/show.ts";
import type { FightChange } from "./fight/fightChange";
import type { SaveKey, SkillKey } from "@/types/party.types";

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
  /** The character's cue for how it is said. Never drawn: it goes back to the voice with the line. */
  how?: string;
}

/** How full the clock the scene runs against is. The page is never told what it counts down to. */
export interface TablePressure {
  filled: number;
  segments: number;
}

/** The mode a d20 is rolled in. Structurally the 5e `RollMode`; named here so this vocabulary stays neutral. */
export type RollMode = "normal" | "advantage" | "disadvantage";

/** What the table asks the player to roll. Never the number to beat: the page is told what to roll, not what it must reach. */
export interface RollAsk {
  label: string;
  kind: "check" | "save";
  ability: SaveKey;
  /** The skill a check is made with; null for a plain ability check and for a save. */
  skill: SkillKey | null;
}

/** The player's answer, as the next turn's request carries it. */
export interface RollAnswer {
  faces: number[];
  mode: RollMode;
  bonus: number;
  atTable: boolean;
}

/** A roll as the server worked it out. No success or failure: the narration says how it went. */
export interface Rolled extends RollAnswer {
  label: string;
  kept: number;
  total: number;
}

export type TableEvent =
  | { type: "session"; sessionId: string; character?: { id: string; name: string } }
  | { type: "text"; delta: string }
  | { type: "tool_start"; name: string }
  | { type: "tool_end"; name: string; isError: boolean }
  | { type: "line"; line: TableLine; /** The server's key for voicing a spoken line, where voices are on. */ voice?: string }
  | { type: "scene"; scene: { id: string; name: string } }
  | { type: "fact"; fact: { id: string; body: string } }
  | { type: "pressure"; pressure: TablePressure | null }
  | { type: "ask_roll"; roll: RollAsk }
  | { type: "rolled"; roll: Rolled }
  | { type: "dm_roll"; roll: DmRoll }
  /** A handout handed over or a picture shown, in its place in the story. */
  | { type: "shown"; shown: Shown }
  /** The Dungeon Master's ruling changes the fight on the board. */
  | { type: "fight_change"; change: FightChange }
  /** Someone the Dungeon Master made up now has a record your character knows of. */
  | { type: "introduced"; name: string }
  /** Whole days passed in the story: the page moves the campaign's date on by them. */
  | { type: "days"; days: number }
  /** Words that can be voiced and are not a character's line: the narrator's, whole, or your own said line. */
  | { type: "voice"; role: "narrator" | "player"; text: string; key: string }
  /** Something changed hands (a gift, a purchase, coins, a thing picked up): a line for the margin. The pack and purse update by themselves. */
  | { type: "hands"; text: string }
  /** Your character's hit points changed outside a fight: what did it, by how much, and where they stand now. */
  | { type: "hit_points"; change: { heals: boolean; why: string; by: number; hp: number; maxHp: number } }
  | { type: "fight"; fight: TableFight | null; /** With null: the fight was let go of without being fought. */ calledOff?: true }
  /** `floor` is "characters" when they were still talking among themselves and nothing waits on the player. */
  | { type: "done"; end: string; credits: number; tokens: number; floor?: "characters" }
  /** `withheld`: the Dungeon Master's answer was dropped by the check on what the table may tell. */
  | { type: "error"; message: string; withheld?: true };

/** A roll the Dungeon Master made in the open. A hidden roll never reaches the page. */
export interface DmRoll {
  /** What it was for, in the Dungeon Master's words; null when unnamed. */
  label: string | null;
  /** The dice asked for, as notation; null when the server could not pass it on. */
  dice: string | null;
  faces: number[];
  /** Dice rolled and set aside (the lower of two with advantage). */
  dropped: number[];
  modifier: number;
  total: number;
}

/** The fight the story has turned into: which encounter, and what it is called. */
export interface TableFight {
  encounterId: string;
  name: string;
}

/** `ask` is the player asking the Dungeon Master something out of character; say and do are the character's. */
export type PlayMode = "say" | "do" | "ask";

/** One thing on the story page. The page is a manuscript, so each kind has its own look (Voices frame). */
export type StoryItem =
  | { id: string; kind: "player"; mode: PlayMode; text: string; /** Sent, but the turn was not kept: shown muted until it is sent again. */ unsent?: boolean; /** The server's key for voicing a line said aloud. */ voice?: { key: string } }
  | { id: string; kind: "narration"; text: string; /** The stretches of it the server offered to a voice, each with its key, in order. */ voices?: Array<{ text: string; key: string }> }
  | { id: string; kind: "spoken"; speaker: TableLine["speaker"]; text: string; to?: string; /** What the voice is asked with: the cue and the server's key for this line. Only a line that arrived live has one. */ voice?: { how: string | null; key: string } }
  | { id: string; kind: "acted"; speaker: TableLine["speaker"]; text: string; /** The server's key for the narrator reading the deed aloud. */ voice?: { key: string } }
  | { id: string; kind: "roll"; roll: Rolled }
  | { id: string; kind: "dmRoll"; roll: DmRoll }
  /** Something the Dungeon Master put in front of the player: a handout, or a picture. */
  | { id: string; kind: "shown"; shown: Shown }
  /** A roll made on the board of a fight: the total, what it was, the dice behind it. Never the target number. */
  | { id: string; kind: "board"; total: number; title: string; detail: string; critical: boolean; byServer: boolean }
  | { id: string; kind: "margin"; text: string; /** How many times in a row the same quiet line happened. */ count: number; /** Something that went on record. Not drawn in the story: the scene column lists what is on record. */ record?: true; /** A line about harm done to you, or the fight's end. */ tone?: "harm" | "end" };

/** Items other than the player's own never need a speaker; this narrows the two that do. */
export type SpeakerItem = Extract<StoryItem, { kind: "spoken" | "acted" }>;
