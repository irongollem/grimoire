import type { DeckCellView, DeckTool } from "@/lib/audio/deck/deckSurface";
import type { SoundCategory, LaunchMode } from "@/types/sound.types";

/**
 * What a pad looks like and says, derived from its cell. Kept out of the
 * component so the words (the tool chip, the accessible name) are testable
 * without mounting and cannot drift from what the pad draws.
 */

/** Audible in any way: lit, fading or ducked. */
export function isAudible(cell: DeckCellView): boolean {
  return cell.light === "playing" || cell.light === "looping" || cell.light === "held" || cell.light === "fading" || cell.light === "ducked";
}

/** Fully lit: the pad's own colour, dark ink and a glow. */
export function isLit(cell: DeckCellView): boolean {
  return cell.light === "playing" || cell.light === "looping" || cell.light === "held";
}

export interface ToolChip {
  text: string;
  /** Filled = the thing is on or will happen; outlined = off or only offered. */
  filled: boolean;
}

/** The small chip that says what a press will do while a tool is active. */
export function toolChipFor(cell: DeckCellView, tool: DeckTool): ToolChip | null {
  if (cell.padId === null) return null;
  const audible = isAudible(cell);
  switch (tool) {
    case "loop":
      return { text: cell.loop ? "Loop on" : "Loop off", filled: cell.loop };
    case "stop":
      return audible ? { text: "Stop", filled: true } : null;
    case "fade":
      return audible ? { text: "Fade out", filled: true } : { text: "Fade in", filled: false };
    case "solo":
      return cell.soloed ? { text: "Solo", filled: true } : null;
    case "volume":
      return { text: `${Math.round(cell.volume * 100)}%`, filled: true };
    case "edit":
      return { text: "Edit", filled: false };
    case "play":
      return null;
  }
}

const LAUNCH_WORDS: Record<LaunchMode, string> = {
  trigger: "Trigger: plays once, every press fires again",
  toggle: "Toggle: press to start, press to stop",
  gate: "Gate: plays while held",
  repeat: "Repeat: fires again and again while held",
};

export function launchModeWords(mode: LaunchMode): string {
  return LAUNCH_WORDS[mode];
}

const TOOL_WORDS: Record<Exclude<DeckTool, "play">, string> = {
  loop: "Press to turn looping on or off",
  stop: "Press to stop it",
  fade: "Press to fade it out or in",
  solo: "Press to solo it",
  volume: "Drag up or down to set its level",
  edit: "Press to edit it",
};

const STATE_WORDS: Record<DeckCellView["light"], string> = {
  off: "empty",
  ready: "ready",
  playing: "playing",
  looping: "playing, looping",
  fading: "fading",
  ducked: "playing quieter, another pad is soloed",
  held: "held",
  blocked: "blocked",
};

/** The pad's name, what a press does, and its state: the one label a screen reader gets. */
export function padAccessibleName(cell: DeckCellView, tool: DeckTool): string {
  const action = tool === "play" ? launchModeWords(cell.mode) : TOOL_WORDS[tool];
  const state = [STATE_WORDS[cell.light]];
  if (cell.light === "blocked" && cell.blockedReason !== null) state.push(cell.blockedReason);
  if (cell.soloed) state.push("soloed");
  return `${cell.name}. ${action}. ${state.join(", ")}.`;
}

/** Category used for colour when a pad somehow has none: the effects colour. */
export function padCategory(cell: DeckCellView): SoundCategory {
  return cell.category === null ? "effects" : cell.category;
}
