import { describe, expect, it, vi } from "vitest";
import type { NpcListRow } from "@/types/npc.types";
import { useChroniclerTextGeneration } from "./useChroniclerTextGeneration";

const mocks = vi.hoisted(() => ({
  appearances: vi.fn(),
  invoke: vi.fn(),
  canon: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaign: { id: "campaign-1" } }),
}));
vi.mock("@/composables/npcs/useNpcFields", () => ({ fetchNpcAppearances: mocks.appearances }));
vi.mock("@/composables/locations/useLocationDescriptions", () => ({
  fetchLocationDescriptions: async () => new Map(),
}));
vi.mock("@/composables/monsters/useMentionedMonsters", () => ({
  fetchMentionedMonsters: async () => new Map(),
}));
vi.mock("./sessionCanonContext", () => ({ fetchSessionCanonText: mocks.canon }));

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

describe("useChroniclerTextGeneration canon this session", () => {
  const params = { rawText: "We met Mira.", tone: "dramatic" as const, npcs: [], monsterIndex: [], partyMembers: [], factions: [], locations: [], existingTags: [] };

  // Bug caught (#1258 item 8): the draft written without being told what the canon did in the session.
  it("sends the list of what the canon did in the note's session with the request", async () => {
    mocks.canon.mockResolvedValue("What changed in the campaign's canon this session:\n- Clues found: A torn ledger");
    mocks.invoke.mockResolvedValue({ data: { chronicle: "x" }, error: null });
    await useChroniclerTextGeneration().generate({ ...params, excludeNoteId: "note-1" });
    expect(mocks.canon).toHaveBeenCalledWith("campaign-1", "note-1");
    expect(mocks.invoke).toHaveBeenLastCalledWith("generate-chronicle-text", expect.objectContaining({
      body: expect.objectContaining({ canon_this_session: expect.stringContaining("Clues found: A torn ledger") }),
    }));
  });

  // Bug caught: a failed canon read stopping the draft, which is better written without the list than not at all.
  it("still drafts when the canon cannot be read", async () => {
    mocks.canon.mockRejectedValue(new Error("down"));
    mocks.invoke.mockResolvedValue({ data: { chronicle: "x" }, error: null });
    await expect(useChroniclerTextGeneration().generate({ ...params, excludeNoteId: "note-1" })).resolves.toMatchObject({ chronicle: "x" });
    expect(mocks.invoke).toHaveBeenLastCalledWith("generate-chronicle-text", expect.objectContaining({ body: expect.objectContaining({ canon_this_session: "" }) }));
  });

  // Bug caught: a new, unsaved note (no session yet) reading canon for no session.
  it("asks for nothing when the note is not saved yet", async () => {
    mocks.canon.mockClear();
    mocks.invoke.mockResolvedValue({ data: { chronicle: "x" }, error: null });
    await useChroniclerTextGeneration().generate(params);
    expect(mocks.canon).not.toHaveBeenCalled();
  });
});
