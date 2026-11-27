import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

// Each key a different price, so a quote on the wrong row shows as the wrong number.
const PRICES: Record<string, number> = {
  quest_generation: 11,
  npc_relationship_suggestion: 12,
  canon_premise_suggestion: 21,
  canon_truth_suggestion: 22,
  canon_clue_suggestion: 23,
  canon_question_suggestion: 24,
  canon_force_suggestion: 25,
  canon_lore_suggestion: 26,
  canon_secret_suggestion: 27,
  canon_read_through: 28,
  canon_arc_suggestion: 29,
  canon_people_suggestion: 30,
  canon_backstory_suggestion: 31,
  canon_species_suggestion: 32,
  canon_habitat_suggestion: 33,
};

vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: (key: string) => PRICES[key] }) }));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({
    imageProvider: ref("openai"),
    textCredits: (base: number) => base, imageCredits: (base: number) => base,
  }),
}));

const { useQuestHooksQuote } = await import("./questHooksQuote");
const { useConnectionSuggestionsQuote } = await import("./connectionSuggestionsQuote");
const { useCanonSuggestionsQuote: useCanonQuote } = await import("./canonSuggestionsQuote");

describe("the review generators' quotes", () => {
  // Bug caught: the quote priced a row the server does not charge (the monster panel once did).
  it("price each generator on the row its edge function charges", () => {
    expect(useQuestHooksQuote()().total).toBe(PRICES.quest_generation);
    expect(useConnectionSuggestionsQuote()().total).toBe(PRICES.npc_relationship_suggestion);
  });

  // Bug caught: a lore draft quoted as truths (or the reverse) because modes shared one row.
  it("price each canon mode on its own ledger row, as suggest-canon's MODES does", () => {
    const quoteFor = useCanonQuote();
    expect(quoteFor("premise").total).toBe(21);
    expect(quoteFor("truths").total).toBe(22);
    expect(quoteFor("clues").total).toBe(23);
    expect(quoteFor("questions").total).toBe(24);
    expect(quoteFor("forces").total).toBe(25);
    expect(quoteFor("lore").total).toBe(26);
    expect(quoteFor("secrets").total).toBe(27);
    expect(quoteFor("read").total).toBe(28);
    expect(quoteFor("arcs").total).toBe(29);
    expect(quoteFor("peoples").total).toBe(30);
    expect(quoteFor("backstory").total).toBe(31);
    expect(quoteFor("species").total).toBe(32);
    expect(quoteFor("habitats").total).toBe(33);
  });
});
