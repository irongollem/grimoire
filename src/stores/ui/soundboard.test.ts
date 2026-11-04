// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSoundboardUiStore } from "./soundboard";

describe("the deck's Simple / Full default", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("gives a DM with no sounds Simple and one who already had sounds Full", () => {
    const fresh = useSoundboardUiStore();
    fresh.settleDeckControls(false);
    expect(fresh.deckControls).toBe("simple");

    localStorage.clear();
    setActivePinia(createPinia());
    const existing = useSoundboardUiStore();
    existing.settleDeckControls(true);
    expect(existing.deckControls).toBe("full");
  });

  // Fails if the default were worked out live from "has sounds": a new DM
  // adding their first sound would see the deck change under them.
  it("does not flip a new DM to Full once they add their first sound", () => {
    const ui = useSoundboardUiStore();
    ui.settleDeckControls(false);
    ui.settleDeckControls(true);
    expect(ui.deckControls).toBe("simple");
  });

  it("keeps an explicit choice over the default", () => {
    const ui = useSoundboardUiStore();
    ui.setDeckControls("full");
    ui.settleDeckControls(false);
    expect(ui.deckControls).toBe("full");
  });
});
