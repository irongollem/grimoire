import { onScopeDispose, ref, watch, type Ref } from "vue";
import type { DeckSize } from "@/lib/audio/deck/deckSurface";

/** How long the pointer rests on the deck's edge before it opens. */
export const PEEK_DWELL_MS = 300;
/** How long a peek stays after the pointer leaves and nothing was pressed. */
export const PEEK_SETTLE_MS = 4000;

export interface DeckPeekOptions {
  size: Ref<DeckSize>;
  /** The "Peek open when I reach for it" setting. */
  enabled: Ref<boolean>;
  /** Bumped by anything outside the deck that wants it seen. */
  signal: Ref<number>;
}

/**
 * Peek (#1136): from Tucked or Row the deck opens to Deck size over the page
 * (it never pushes the page) when the DM reaches for it, and settles back by
 * itself. Only the state lives here; each surface draws the peek its own way.
 */
export function useDeckPeek({ size, enabled, signal }: DeckPeekOptions) {
  const peeking = ref(false);
  let dwell: ReturnType<typeof setTimeout> | null = null;
  let settle: ReturnType<typeof setTimeout> | null = null;
  let inside = false;

  const canPeek = (): boolean => enabled.value && (size.value === "tucked" || size.value === "row");

  function clearTimers(): void {
    if (dwell !== null) clearTimeout(dwell);
    if (settle !== null) clearTimeout(settle);
    dwell = null;
    settle = null;
  }

  function armSettle(): void {
    if (settle !== null) clearTimeout(settle);
    settle = setTimeout(() => close(), PEEK_SETTLE_MS);
  }

  function close(): void {
    clearTimers();
    inside = false;
    peeking.value = false;
  }

  function open(): void {
    if (!canPeek()) return;
    peeking.value = true;
    if (!inside) armSettle();
  }

  /** The pointer came to rest on the deck's top edge. */
  function edgeEnter(): void {
    if (!canPeek() || peeking.value) return;
    if (dwell !== null) clearTimeout(dwell);
    dwell = setTimeout(() => {
      dwell = null;
      open();
    }, PEEK_DWELL_MS);
  }

  function edgeLeave(): void {
    if (dwell !== null) clearTimeout(dwell);
    dwell = null;
  }

  /** The pointer is on the open peek: keep it. */
  function hold(): void {
    inside = true;
    if (settle !== null) clearTimeout(settle);
    settle = null;
  }

  /** The pointer left the open peek: settle back soon. */
  function release(): void {
    inside = false;
    if (peeking.value) armSettle();
  }

  watch(signal, open);
  watch(size, () => {
    if (!canPeek()) close();
  });
  watch(enabled, (on) => {
    if (!on) close();
  });
  onScopeDispose(clearTimers);

  return { peeking, open, close, edgeEnter, edgeLeave, hold, release };
}

const ORDER: readonly DeckSize[] = ["tucked", "row", "deck", "full"];

/** tucked, row, deck, full, then round to tucked. */
export function nextDeckSize(size: DeckSize): DeckSize {
  return ORDER[(ORDER.indexOf(size) + 1) % ORDER.length] ?? "row";
}
