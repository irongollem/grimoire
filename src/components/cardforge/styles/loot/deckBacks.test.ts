// deckBacks.ts routes every loot-back URL through artUrl() (#864/#877) so the
// art can move to R2 behind the CDN. artUrl is a no-op with the CDN unset or
// the path unmapped, so this asserts the one thing that must never change:
// with no VITE_ASSET_CDN_URL configured (the state of every test run and
// every deploy before R2 holds the bytes), every built-in deck back must
// resolve to exactly the same local path it did before artUrl existed.
import { describe, it, expect } from "vitest";
import { BUILTIN_DECK_BACKS, DEFAULT_DECK_BACK_ID, deckBackById } from "./deckBacks";

describe("BUILTIN_DECK_BACKS", () => {
  it("resolves every deck's urls unchanged when the CDN is unset, each named for its own deck", () => {
    for (const deck of BUILTIN_DECK_BACKS) {
      expect(deck.urls.mtg, deck.id).toBe(`/assets/cardforge/loot-backs/${deck.id}-tc.webp`);
      expect(deck.urls.tarot, deck.id).toBe(`/assets/cardforge/loot-backs/${deck.id}-tarot.webp`);
    }
  });

  it("gives every deck its own id, since the id is what a saved choice is keyed on", () => {
    const ids = BUILTIN_DECK_BACKS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the default deck back resolvable by id, and answers nothing for an id it does not know", () => {
    expect(deckBackById(DEFAULT_DECK_BACK_ID)?.id).toBe(DEFAULT_DECK_BACK_ID);
    expect(deckBackById("a-deleted-deck")).toBeUndefined();
  });
});
