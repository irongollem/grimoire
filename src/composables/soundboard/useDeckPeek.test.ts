import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { nextDeckSize, PEEK_DWELL_MS, PEEK_SETTLE_MS, useDeckPeek } from "@/composables/soundboard/useDeckPeek";
import type { DeckSize } from "@/lib/audio/deck/deckSurface";

function setup(initial: DeckSize = "tucked", enabled = true) {
  const size = ref<DeckSize>(initial);
  const on = ref(enabled);
  const signal = ref(0);
  const scope = effectScope();
  const peek = scope.run(() => useDeckPeek({ size, enabled: on, signal }));
  if (peek === undefined) throw new Error("scope did not run");
  return { size, on, signal, peek, scope };
}

describe("useDeckPeek", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // A key or a cue from the Row bar peeked over the bar, so the same pads showed twice (8 Nov 2026).
  it("opens on a signal from tucked only: the Row bar already shows the row a key fires", async () => {
    for (const [size, opens] of [["tucked", true], ["row", false], ["deck", false], ["full", false]] as const) {
      const { signal, peek } = setup(size);
      signal.value += 1;
      await nextTick();
      expect(peek.peeking.value, size).toBe(opens);
    }
  });

  it("does not open when the setting is off", async () => {
    const { signal, peek } = setup("tucked", false);
    signal.value += 1;
    await nextTick();
    expect(peek.peeking.value).toBe(false);
  });

  it("settles back by itself after a signal peek nobody touched", async () => {
    const { signal, peek } = setup();
    signal.value += 1;
    await nextTick();
    vi.advanceTimersByTime(PEEK_SETTLE_MS - 1);
    expect(peek.peeking.value).toBe(true);
    vi.advanceTimersByTime(1);
    expect(peek.peeking.value).toBe(false);
  });

  it("stays open while the pointer is on it and settles after it leaves", async () => {
    const { signal, peek } = setup();
    signal.value += 1;
    await nextTick();
    peek.hold();
    vi.advanceTimersByTime(PEEK_SETTLE_MS * 3);
    expect(peek.peeking.value).toBe(true);
    peek.release();
    vi.advanceTimersByTime(PEEK_SETTLE_MS);
    expect(peek.peeking.value).toBe(false);
  });

  it("opens from the Row bar's edge only after the pointer has rested there, not on a pass-through", () => {
    const { peek } = setup("row");
    peek.edgeEnter();
    vi.advanceTimersByTime(PEEK_DWELL_MS - 1);
    peek.edgeLeave();
    vi.advanceTimersByTime(PEEK_DWELL_MS);
    expect(peek.peeking.value).toBe(false);
    peek.edgeEnter();
    vi.advanceTimersByTime(PEEK_DWELL_MS);
    expect(peek.peeking.value).toBe(true);
  });

  it("closes at once when the size becomes deck", async () => {
    const { signal, size, peek } = setup();
    signal.value += 1;
    await nextTick();
    size.value = "deck";
    await nextTick();
    expect(peek.peeking.value).toBe(false);
  });
});

describe("nextDeckSize", () => {
  it("cycles tucked, row, deck, full and back to tucked", () => {
    expect(nextDeckSize("tucked")).toBe("row");
    expect(nextDeckSize("row")).toBe("deck");
    expect(nextDeckSize("deck")).toBe("full");
    expect(nextDeckSize("full")).toBe("tucked");
  });
});
