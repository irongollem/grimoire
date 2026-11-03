/**
 * Tap versus hold on a tool button (#1136), in one place for every driver that
 * has buttons: MIDI and the keyboard both ask the same question. Down borrows
 * the tool; up gives it back; a press shorter than TAP_MS with no pad fired in
 * between also sends "toggle", which locks the tool on (or off again).
 *
 * Vue-free, with the clock passed in, so a driver can be tested without timers.
 */

import type { DeckPhase } from "./deckSurface";

/** A button released sooner than this, with no pad pressed meanwhile, is a tap. */
export const TAP_MS = 250;

interface HeldButton {
  at: number;
  padPressed: boolean;
  send: (phase: DeckPhase) => void;
}

export interface HoldTap {
  /** A button went down (`down` true) or came up. A repeat of a down is ignored. */
  edge(key: string, down: boolean, send: (phase: DeckPhase) => void): void;
  /** A pad was pressed: every button held right now becomes a hold, never a tap. */
  padPressed(): void;
  /** Keys of the buttons currently down. */
  keys(): string[];
  /** Gives back every held button whose key matches, as if each had been released. */
  releaseMatching(match: (key: string) => boolean): void;
}

export function createHoldTap(now: () => number, tapMs: number = TAP_MS): HoldTap {
  const held = new Map<string, HeldButton>();

  return {
    edge(key, down, send) {
      if (down) {
        if (held.has(key)) return;
        held.set(key, { at: now(), padPressed: false, send });
        send("down");
        return;
      }
      const button = held.get(key);
      if (!button) return;
      held.delete(key);
      send("up");
      if (!button.padPressed && now() - button.at < tapMs) send("toggle");
    },
    padPressed() {
      for (const button of held.values()) button.padPressed = true;
    },
    keys() {
      return [...held.keys()];
    },
    releaseMatching(match) {
      for (const [key, button] of held) {
        if (!match(key)) continue;
        held.delete(key);
        button.send("up");
      }
    },
  };
}
