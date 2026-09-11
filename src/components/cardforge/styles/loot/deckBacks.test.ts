// deckBacks.ts routes every loot-back URL through artUrl() (#864/#877) so the
// art can move to R2 behind the CDN. artUrl is a no-op with the CDN unset or
// the path unmapped, so this asserts the one thing that must never change:
// with no VITE_ASSET_CDN_URL configured (the state of every test run and
// every deploy before R2 holds the bytes), every built-in deck back must
// resolve to exactly the same local path it did before artUrl existed.
import { describe, it, expect } from "vitest";
import { BUILTIN_DECK_BACKS, DEFAULT_DECK_BACK_ID, deckBackById } from "./deckBacks";

describe("BUILTIN_DECK_BACKS", () => {
  it("resolves every deck's urls unchanged when the CDN is unset", () => {
    for (const deck of BUILTIN_DECK_BACKS) {
      expect(deck.urls.mtg).toMatch(/^\/assets\/cardforge\/loot-backs\/.+-tc\.webp$/);
      expect(deck.urls.tarot).toMatch(/^\/assets\/cardforge\/loot-backs\/.+-tarot\.webp$/);
    }
  });

  it("keeps the default deck back resolvable by id", () => {
    const deck = deckBackById(DEFAULT_DECK_BACK_ID);
    expect(deck).toBeDefined();
    expect(deck?.urls.mtg).toBe("/assets/cardforge/loot-backs/arcane-vortex-tc.webp");
    expect(deck?.urls.tarot).toBe("/assets/cardforge/loot-backs/arcane-vortex-tarot.webp");
  });
});
