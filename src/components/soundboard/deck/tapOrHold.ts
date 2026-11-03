import type { DeckPhase } from "@/lib/audio/deck/deckSurface";
import { TAP_MS } from "@/lib/audio/deck/holdTap";

/**
 * A press held this long counts as borrowing the button, not tapping it. The
 * same threshold as the keyboard and controller rule in holdTap.ts.
 *
 * Why two helpers for one rule: a key or a controller button sends `down` at
 * once, because the DM holds L with one finger and hits a pad with another a
 * moment later (holdTap). On a screen one finger cannot hold a tool and press a
 * pad, so a tap must lock cleanly without a flash of "borrowed", and `down`
 * waits until the hold is deliberate (this file).
 */
export const HOLD_MS = TAP_MS;

/**
 * The one rule behind every deck button that is both a switch and a modifier
 * (the tools, Hush): a tap locks it on or off (`toggle`), and a press held past
 * `HOLD_MS` borrows it for as long as the finger stays down (`down` at the
 * threshold, `up` on release), the way Shift works. A keyboard click (detail 0)
 * has no hold to measure, so it toggles.
 *
 * Plain functions rather than a composable so each button owns its own timer.
 */
export function createTapOrHold(emit: (phase: DeckPhase) => void) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let borrowing = false;

  function begin(): void {
    cancelTimer();
    timer = setTimeout(() => {
      timer = null;
      borrowing = true;
      emit("down");
    }, HOLD_MS);
  }

  function cancelTimer(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  /** Finger up, pointer cancelled or capture lost. Safe to call more than once. */
  function end(): void {
    if (borrowing) {
      borrowing = false;
      emit("up");
      return;
    }
    if (timer !== null) {
      cancelTimer();
      emit("toggle");
    }
  }

  /** Keyboard activation: the click that no pointer press preceded. */
  function onClick(event: MouseEvent): void {
    // A pointer press already spoke through begin/end; its click has detail >= 1.
    if (event.detail === 0) emit("toggle");
  }

  /** Unmounting mid-hold must not leave the tool borrowed forever. */
  function dispose(): void {
    cancelTimer();
    if (borrowing) {
      borrowing = false;
      emit("up");
    }
  }

  return { begin, end, onClick, dispose };
}
