import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ASK_PREFILL_TTL_MS, useAskPrefillStore } from "./askPrefill";

describe("useAskPrefillStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  // Bug caught: a request kept after it was taken refilled the box on every later visit to the screen.
  it("hands a request over once", () => {
    const store = useAskPrefillStore();
    store.offer("quest_designer", "A heist");
    expect(store.take("quest_designer")).toBe("A heist");
    expect(store.take("quest_designer")).toBeNull();
  });

  // Bug caught: one screen's request was taken by another screen.
  it("keeps each screen's request apart", () => {
    const store = useAskPrefillStore();
    store.offer("map_style", "Inked");
    expect(store.take("complication")).toBeNull();
    expect(store.take("map_style")).toBe("Inked");
  });

  // Bug caught: a screen that never opened (AI off) filled its box minutes later with a request the DM had forgotten.
  it("drops a request nobody took in time", () => {
    const store = useAskPrefillStore();
    store.offer("map_style", "Inked");
    vi.advanceTimersByTime(ASK_PREFILL_TTL_MS + 1);
    expect(store.take("map_style")).toBeNull();
  });

  // Bug caught: asking twice left the first request to be taken instead of the latest.
  it("a newer request replaces an older one", () => {
    const store = useAskPrefillStore();
    store.offer("map_style", "first");
    store.offer("map_style", "second");
    expect(store.take("map_style")).toBe("second");
  });
});
