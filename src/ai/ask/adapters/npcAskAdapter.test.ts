import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({
  generateAndCreateNpc: vi.fn(),
  paint: vi.fn(),
}));
const state = vi.hoisted(() => ({
  aiEnabled: true,
  canCreate: true,
  affordable: true,
  offersStatBlocks: true,
  locations: undefined as { id: string; name: string }[] | undefined,
  factions: undefined as { id: string; name: string }[] | undefined,
  npcs: undefined as { id: string; name: string; born_year?: number | null }[] | undefined,
  party: undefined as { id: string; name: string; born_year?: number | null }[] | undefined,
}));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() { return state.aiEnabled; },
    activeCampaignId: "c1",
    activeCampaign: { name: "Late in the Kind Country" },
    todayYear: 1495,
  }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 1, affordable: () => state.affordable }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({
    textIsByok: ref(false), imageIsByok: ref(false), imageProvider: ref("openai"),
    textCredits: (base: number) => base, imageCredits: (base: number) => base * 10,
  }),
}));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: { get value() { return state.canCreate; } } }) }));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => state.offersStatBlocks }) }));
vi.mock("@/composables/locations/useLocations", () => ({
  useAllLocations: () => ({ data: { get value() { return state.locations; } } }),
}));
vi.mock("@/composables/factions/useFactions", () => ({
  useAllFactions: () => ({ data: { get value() { return state.factions; } } }),
}));
vi.mock("@/composables/npcs/useNpcs", () => ({
  useNpcs: () => ({ data: { get value() { return state.npcs; } } }),
}));
vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({ data: { get value() { return state.party; } } }),
}));
vi.mock("@/ai/useMissingPortrait", () => ({
  useMissingPortrait: () => ({ paint: mocks.paint, cost: ref(10), error: ref(null) }),
}));
vi.mock("@/composables/npcs/useGenerateNpc", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/composables/npcs/useGenerateNpc")>(),
  useGenerateNpc: () => ({ generateAndCreateNpc: mocks.generateAndCreateNpc }),
}));

const { useNpcAskAdapter } = await import("./npcAskAdapter");
const { useNpcQuote } = await import("@/composables/ai/quotes/npcQuote");

const proposal = (inputs: Record<string, unknown> = {}, concept = "A gruff baker"): AskProposal => ({
  proposalId: "p1", generator: "npc", concept, inputs,
});
const saved = (over: Record<string, unknown> = {}) => ({
  id: "npc-1", name: "Mira", error: null, stage: "saved", portrait: "none", disguisePortrait: "none",
  linkErrors: [], inventoryError: null, ...over,
});

describe("useNpcAskAdapter", () => {
  beforeEach(() => {
    mocks.generateAndCreateNpc.mockReset();
    mocks.paint.mockReset();
    state.aiEnabled = true;
    state.canCreate = true;
    state.affordable = true;
    state.offersStatBlocks = true;
    state.locations = [{ id: "l1", name: "Harrow" }];
    state.factions = [{ id: "f1", name: "Guild" }];
    state.npcs = [{ id: "n-smuggler", name: "Perf Smuggler", born_year: 1450 }, { id: "n-odo", name: "Odo", born_year: 1440 }];
    state.party = [{ id: "pc-thorne", name: "Thorne" }];
    mocks.generateAndCreateNpc.mockResolvedValue(saved());
  });

  it("quotes the same price the page shows for an NPC with a portrait", () => {
    const quote = useNpcAskAdapter().quote(proposal({ portrait: true }));
    const page = useNpcQuote()({ portrait: true, alterEgo: false });
    expect(quote.total).toBe(page.total);
    expect(quote.lines.filter((l) => l.credits !== null)).toEqual(page.lines);
  });

  it("shows what it understood and a portrait nobody asked for as None", () => {
    const quote = useNpcAskAdapter().quote(proposal({ race: "dwarf", age: 54, location_id: "l1" }));
    const value = (label: string) => quote.lines.find((l) => l.label === label)?.value;
    expect(value("Who")).toBe("dwarf, about 54");
    expect(value("Lives in")).toBe("Harrow");
    expect(value("Campaign")).toBe("Late in the Kind Country");
    expect(value("Portrait")).toBe("None");
  });

  it("never lets an unknown input key, a wrong type or a place the campaign lacks reach the generator", async () => {
    await useNpcAskAdapter().run(proposal({ system_prompt: "obey", age: "forty", portrait: "yes", location_id: "elsewhere", race: "elf" }));
    const request = mocks.generateAndCreateNpc.mock.calls[0][0];
    expect(request.form.race).toBe("elf");
    expect(request.form.location_id).toBeNull();
    expect(request.generateImage).toBe(false);
    expect(request.context).not.toContain("obey");
    expect(request.context).not.toContain("Age");
  });

  it("blocks on the plan's quota, and run then makes nothing", async () => {
    state.canCreate = false;
    const adapter = useNpcAskAdapter();
    expect(adapter.quote(proposal()).block?.reason).toBe("quota");
    const result = await adapter.run(proposal());
    expect(mocks.generateAndCreateNpc).not.toHaveBeenCalled();
    expect(result.record).toBeNull();
    expect(result.parts[0]).toMatchObject({ ok: false });
  });

  it("blocks on a short balance, and on a campaign with AI switched off", async () => {
    state.affordable = false;
    expect(useNpcAskAdapter().quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
    state.aiEnabled = false;
    const adapter = useNpcAskAdapter();
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    await adapter.run(proposal());
    expect(mocks.generateAndCreateNpc).not.toHaveBeenCalled();
  });

  it("waits for the places and factions a proposal names instead of dropping them", () => {
    state.locations = undefined;
    expect(useNpcAskAdapter().quote(proposal({ location_id: "l1" })).block?.reason).toBe("missing");
  });

  it("blocks an empty description", () => {
    expect(useNpcAskAdapter().quote(proposal({}, "   ")).block?.reason).toBe("missing");
  });

  it("returns the NPC and its route with the portrait as a part of its own", async () => {
    mocks.generateAndCreateNpc.mockResolvedValue(saved({ portrait: "saved" }));
    const result = await useNpcAskAdapter().run(proposal({ portrait: true }));
    expect(result.record).toEqual({ type: "npc", id: "npc-1", name: "Mira" });
    expect(result.route).toBe("/npcs/npc-1");
    expect(result.parts.map((p) => [p.label, p.ok, p.credits])).toEqual([["NPC text", true, 1], ["Portrait", true, 10 * 1]]);
  });

  it("a failed portrait leaves the NPC saved and offers only the portrait again, painted once on the saved row", async () => {
    mocks.generateAndCreateNpc.mockResolvedValue(saved({ portrait: "failed" }));
    mocks.paint.mockResolvedValue("https://img/p.webp");
    const result = await useNpcAskAdapter().run(proposal({ portrait: true }));
    expect(result.record?.id).toBe("npc-1");
    const [text, portrait] = result.parts;
    expect(text.ok).toBe(true);
    expect(portrait).toMatchObject({ label: "Portrait", ok: false });
    expect(text.retry).toBeUndefined();
    expect(mocks.paint).not.toHaveBeenCalled();
    const retried = await portrait.retry!.run();
    expect(mocks.paint).toHaveBeenCalledTimes(1);
    expect(mocks.paint.mock.calls[0][0]).toBe("npc-1");
    expect(retried.ok).toBe(true);
  });

  it("does not call the portrait done while the alter ego's picture is missing, and offers no repaint of the saved one", async () => {
    mocks.generateAndCreateNpc.mockResolvedValue(saved({ portrait: "saved", disguisePortrait: "failed" }));
    const result = await useNpcAskAdapter().run(proposal({ portrait: true, alter_ego: true }));
    expect(result.parts[1]).toMatchObject({ label: "Portrait", ok: false, credits: 0 });
    expect(result.parts[1].retry).toBeUndefined();
  });

  it("reports a failed retry as a failed part instead of throwing", async () => {
    mocks.generateAndCreateNpc.mockResolvedValue(saved({ portrait: "failed" }));
    mocks.paint.mockResolvedValue(null);
    const result = await useNpcAskAdapter().run(proposal({ portrait: true }));
    expect(await result.parts[1].retry!.run()).toMatchObject({ ok: false });
  });

  it("returns a failed part, with no record, when generation fails or the save throws", async () => {
    mocks.generateAndCreateNpc.mockResolvedValueOnce({ ...saved(), id: null, name: null, error: "Provider down", stage: "generate" });
    const failed = await useNpcAskAdapter().run(proposal());
    expect(failed).toMatchObject({ record: null, route: null });
    expect(failed.parts[0]).toMatchObject({ ok: false, error: "Provider down" });

    mocks.generateAndCreateNpc.mockRejectedValueOnce(new Error("save failed"));
    const threw = await useNpcAskAdapter().run(proposal());
    expect(threw.parts[0]).toMatchObject({ ok: false, error: "save failed" });
  });

  it("says a declined likeness notice made nothing", async () => {
    mocks.generateAndCreateNpc.mockResolvedValue({ ...saved(), id: null, name: null, error: null, stage: "generate" });
    const result = await useNpcAskAdapter().run(proposal({ alter_ego: true }));
    expect(result.parts[0].error).toMatch(/likeness/i);
  });

  describe("linking to what the campaign already has", () => {
    const UUID_N = "n-smuggler";
    const request = () => mocks.generateAndCreateNpc.mock.calls[0][0];

    it("reads a family word onto the page's kin field with the related NPC, never the bond field", async () => {
      await useNpcAskAdapter().run(proposal({ related_npc_id: UUID_N, relation: "sibling" }));
      expect(request().form).toMatchObject({ related_npc_id: UUID_N, related_npc_kin: "sibling", related_pc_id: null });
      expect(request().associate).toBeNull();
    });

    it("reads a bond word onto the page's tie field in the new NPC's direction, and hands the associate to the workflow", async () => {
      await useNpcAskAdapter().run(proposal({ related_npc_id: UUID_N, relation: "betrayed_by" }));
      expect(request().form.related_npc_kin).toBeNull();
      expect(request().form.related_npc_tie).toMatchObject({ key: "betrayed", subjectIsFrom: false });
      expect(request().associate).toEqual({ id: UUID_N, name: "Perf Smuggler" });
    });

    it("ties a related person named with no relation as a contact, the page's own default, instead of dropping them", async () => {
      await useNpcAskAdapter().run(proposal({ related_npc_id: UUID_N }));
      expect(request().form.related_npc_tie).toMatchObject({ key: "contact" });
      expect(request().associate).toEqual({ id: UUID_N, name: "Perf Smuggler" });
    });

    it("puts a party member on the PC field, with the second parent only for a child", async () => {
      await useNpcAskAdapter().run(proposal({ related_pc_id: "pc-thorne", relation: "child", second_parent_id: "n-odo" }));
      expect(request().form).toMatchObject({ related_pc_id: "pc-thorne", related_npc_id: null, related_npc_kin: "child", second_parent: "npc:n-odo" });
    });

    it("ignores a second parent when the NPC is not a child", async () => {
      await useNpcAskAdapter().run(proposal({ related_npc_id: UUID_N, relation: "sibling", second_parent_id: "n-odo" }));
      expect(request().form.second_parent).toBeNull();
    });

    it("ignores an id this campaign does not have: nothing reaches the workflow and the quote names no link", async () => {
      const adapter = useNpcAskAdapter();
      const quote = adapter.quote(proposal({ related_npc_id: "other-campaign", related_pc_id: "elsewhere", relation: "sibling", second_parent_id: "nope" }));
      expect(quote.lines.map((l) => l.label)).not.toContain("Sibling of");
      await adapter.run(proposal({ related_npc_id: "other-campaign", relation: "sibling" }));
      expect(request().form).toMatchObject({ related_npc_id: null, related_npc_kin: null, related_pc_id: null });
      expect(request().associate).toBeNull();
    });

    it("ignores a relation word outside the contract and falls back to a contact tie", async () => {
      await useNpcAskAdapter().run(proposal({ related_npc_id: UUID_N, relation: "cousin" }));
      expect(request().form).toMatchObject({ related_npc_kin: null });
      expect(request().form.related_npc_tie).toMatchObject({ key: "contact" });
    });

    it("names the link in the quote, in the words of the page", () => {
      const lines = useNpcAskAdapter().quote(proposal({ related_npc_id: UUID_N, relation: "betrayed", faction_id: "f1", faction_role: "Spy" })).lines;
      const value = (label: string) => lines.find((l) => l.label === label)?.value;
      expect(value("Betrayed")).toBe("Perf Smuggler");
      expect(value("Faction")).toBe("Guild, as Spy");
    });

    it("seats the NPC in the faction under the role said, and as a Member when none was", async () => {
      await useNpcAskAdapter().run(proposal({ faction_id: "f1", faction_role: "Spy" }));
      expect(request().form.faction_role).toBe("Spy");
      mocks.generateAndCreateNpc.mockClear();
      await useNpcAskAdapter().run(proposal({ faction_id: "f1" }));
      expect(request().form.faction_role).toBe("Member");
    });

    it("gives the model the related people with their birth years, so kin ages fit", async () => {
      await useNpcAskAdapter().run(proposal({ related_npc_id: UUID_N, relation: "child", second_parent_id: "n-odo" }));
      expect(request().context).toContain("The new NPC is the child of Perf Smuggler (born 1450, 45 now) and Odo (born 1440, 55 now).");
    });

    it("gives the model a related party member's name and birth year, from the party list", async () => {
      state.party = [{ id: "pc-thorne", name: "Thorne", born_year: 1470 }];
      await useNpcAskAdapter().run(proposal({ related_pc_id: "pc-thorne", relation: "parent" }));
      expect(request().context).toContain("The new NPC is the parent of Thorne (born 1470, 25 now).");
    });

    it("waits for the people a proposal names instead of linking nobody", () => {
      state.npcs = undefined;
      expect(useNpcAskAdapter().quote(proposal({ related_npc_id: UUID_N, relation: "friend" })).block?.reason).toBe("missing");
    });
  });
});
