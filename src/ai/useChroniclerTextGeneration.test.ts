import { describe, expect, it, vi } from "vitest";
import type { NpcListRow } from "@/types/npc.types";
import { useChroniclerTextGeneration } from "./useChroniclerTextGeneration";

const mocks = vi.hoisted(() => ({
  appearances: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaign: { id: "campaign-1" } }),
}));
vi.mock("@/composables/rules/useRuleset", () => ({
  useTableRuleset: () => ({ ruleset: { value: "2024" } }),
}));
vi.mock("@/composables/npcs/useNpcFields", () => ({ fetchNpcAppearances: mocks.appearances }));
vi.mock("@/composables/locations/useLocationDescriptions", () => ({
  fetchLocationDescriptions: async () => new Map(),
}));
vi.mock("@/composables/monsters/useMentionedMonsters", () => ({
  fetchMentionedMonsters: async () => new Map(),
}));
vi.mock("./providers", () => ({ getTextProvider: vi.fn() }));
vi.mock("./systemPrompts", () => ({ fetchSystemPrompt: vi.fn(), fetchRulesetContext: vi.fn() }));
vi.mock("@/composables/ai/useAiCredits", () => ({ logUsage: vi.fn() }));

describe("useChroniclerTextGeneration NPC context", () => {
  it.each([
    { fails: true, description: "Mira" },
    { fails: false, description: expect.stringContaining("Silver hair") },
  ])("continues generation when appearance fetch fails=$fails", async ({ fails, description }) => {
    if (fails) mocks.appearances.mockRejectedValue(new Error("Appearance fetch failed"));
    else mocks.appearances.mockResolvedValue(new Map([["npc-1", "Silver hair"]]));
    mocks.invoke.mockResolvedValue({ data: { chronicle: "The party met Mira." }, error: null });

    const generator = useChroniclerTextGeneration();
    const result = await generator.generate({
      rawText: "We met @Mira.",
      tone: "dramatic",
      npcs: [
        { id: "npc-1", name: "Mira", portrait_url: null },
        { id: "npc-2", name: "Gnarl", portrait_url: null },
      ] as NpcListRow[],
      monsterIndex: [],
      partyMembers: [],
      factions: [],
      locations: [],
      existingTags: [],
    });

    expect(mocks.appearances).toHaveBeenCalledExactlyOnceWith(["npc-1"]);
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith("generate-chronicle-text", expect.objectContaining({
      body: expect.objectContaining({ entity_descriptions: [description] }),
    }));
    expect(result.chronicle).toBe("The party met Mira.");
    expect(generator.error.value).toBeNull();
    expect(generator.isGenerating.value).toBe(false);
  });
});
