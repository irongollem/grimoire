import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({
  generateAndCreateNpc: vi.fn(),
  applyNpcLinks: vi.fn(),
  applyGeneratorLinks: vi.fn(),
  createNpc: vi.fn(),
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
  items: undefined as { id: string; name: string }[] | undefined,
  /** `kind:id` to name for the records the ties name; undefined while "reading". */
  linkNames: new Map<string, string>() as Map<string, string> | undefined,
  /** The campaign's kin links; undefined while "reading". */
  kinLinks: [] as { kind: string; from_npc_id: string | null; from_party_member_id: string | null; to_npc_id: string | null; to_party_member_id: string | null }[] | undefined,
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
    imageProvider: ref("openai"),
    textCredits: (base: number) => base, imageCredits: (base: number) => base * 10,
  }),
}));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: { get value() { return state.canCreate; } } }) }));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => state.offersStatBlocks }) }));
// The world lists no peoples here: the species the DM asked for, or none, goes through as said.
vi.mock("@/composables/canon/useCampaignPeoples", () => ({ useCampaignPeoples: () => ({ peoples: { value: [] } }) }));
vi.mock("@/composables/locations/useLocations", () => ({
  useAllLocations: () => ({ data: { get value() { return state.locations; } } }),
}));
vi.mock("@/composables/factions/useFactions", () => ({
  useAllFactions: () => ({ data: { get value() { return state.factions; } } }),
}));
vi.mock("@/composables/npcs/useNpcs", () => ({
  useNpcs: () => ({ data: { get value() { return state.npcs; } } }),
  useCreateNpcInCampaign: () => ({ mutateAsync: mocks.createNpc }),
}));
vi.mock("@/composables/items/useItemIndex", () => ({
  useItemIndex: () => ({ data: { get value() { return state.items; } } }),
}));
vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({ data: { get value() { return state.party; } } }),
}));
vi.mock("@/ai/ask/adapters/askLinkRecords", () => ({
  useAskLinkRecords: (wanted: () => readonly unknown[]) => ({
    names: computed(() => state.linkNames),
    loading: computed(() => wanted().length > 0 && state.linkNames === undefined),
    failed: computed(() => false),
  }),
}));
vi.mock("@/composables/kinship/useKinLinks", () => ({
  useKinLinks: () => ({ data: { get value() { return state.kinLinks; } } }),
}));
vi.mock("@/ai/useMissingPortrait", () => ({
  useMissingPortrait: () => ({ paint: mocks.paint, cost: ref(10), error: ref(null) }),
}));
vi.mock("@/composables/npcs/useGenerateNpc", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/composables/npcs/useGenerateNpc")>(),
  useGenerateNpc: () => ({ generateAndCreateNpc: mocks.generateAndCreateNpc, applyNpcLinks: mocks.applyNpcLinks, applyGeneratorLinks: mocks.applyGeneratorLinks }),
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
    mocks.createNpc.mockReset().mockResolvedValue({ id: "npc-9" });
    mocks.applyNpcLinks.mockReset().mockResolvedValue([]);
    mocks.applyGeneratorLinks.mockReset().mockResolvedValue([]);
    state.aiEnabled = true;
    state.canCreate = true;
    state.affordable = true;
    state.offersStatBlocks = true;
    state.locations = [{ id: "00000000-0000-4000-8000-0000000000d1", name: "Harrow" }];
    state.factions = [{ id: "00000000-0000-4000-8000-0000000000e1", name: "Guild" }];
    state.npcs = [{ id: "00000000-0000-4000-8000-0000000000b1", name: "Perf Smuggler", born_year: 1450 }, { id: "00000000-0000-4000-8000-0000000000b2", name: "Odo", born_year: 1440 }];
    state.party = [{ id: "00000000-0000-4000-8000-0000000000c1", name: "Thorne" }];
    state.kinLinks = [];
    state.items = [{ id: "i1", name: "Healing Potion" }, { id: "i2", name: "Rope" }];
    state.linkNames = new Map();
    mocks.generateAndCreateNpc.mockResolvedValue(saved());
  });

  describe("links", () => {
    const AURIL = "00000000-0000-4000-8000-0000000000a1";
    const DOCKS = "00000000-0000-4000-8000-0000000000a2";
    const links = [
      { kind: "deity", id: AURIL, relation: "worships" },
      { kind: "location", id: DOCKS, relation: "works_at" },
    ];
    beforeEach(() => {
      state.linkNames = new Map([[`deity:${AURIL}`, "Auril"], [`location:${DOCKS}`, "The Docks"]]);
    });

    it("names each tie on the quote and hands the page's own pending ties to the workflow", async () => {
      const adapter = useNpcAskAdapter();
      const quote = adapter.quote(proposal({ links }));
      expect(quote.lines.filter((l) => ["Worships", "Works at"].includes(l.label)).map((l) => [l.label, l.value])).toEqual([["Worships", "Auril"], ["Works at", "The Docks"]]);
      await adapter.run(proposal({ links }));
      const request = mocks.generateAndCreateNpc.mock.calls[0][0];
      expect(request.links.map((l: { kind: string; id: string; name: string; choice: { key: string; subjectIsFrom: boolean } }) => [l.kind, l.id, l.name, l.choice.key, l.choice.subjectIsFrom])).toEqual([
        ["deity", AURIL, "Auril", "worships", true],
        ["location", DOCKS, "The Docks", "works_at", true],
      ]);
      expect(request.context).toContain("Ties: worships Auril; works at The Docks");
    });

    // Bug caught: a link to a record that is not this campaign's was tied anyway.
    it("ignores a tie whose record is not in this campaign", async () => {
      state.linkNames = new Map([[`deity:${AURIL}`, "Auril"]]);
      await useNpcAskAdapter().run(proposal({ links }));
      expect(mocks.generateAndCreateNpc.mock.calls[0][0].links).toHaveLength(1);
    });

    // Bug caught: run before the records were read made the NPC with no ties, silently.
    it("waits for the records the ties name, and run makes nothing meanwhile", async () => {
      state.linkNames = undefined;
      const adapter = useNpcAskAdapter();
      expect(adapter.quote(proposal({ links })).block?.reason).toBe("missing");
      await adapter.run(proposal({ links }));
      expect(mocks.generateAndCreateNpc).not.toHaveBeenCalled();
    });

    it("never lets a relation the catalogue lacks for the pair reach the workflow", async () => {
      await useNpcAskAdapter().run(proposal({ links: [{ kind: "item", id: AURIL, relation: "worships" }, { kind: "deity", id: AURIL, relation: "parent_of" }] }));
      expect(mocks.generateAndCreateNpc.mock.calls[0][0].links).toEqual([]);
    });

    it("shows a failed tie as its own part, with the NPC still saved", async () => {
      mocks.generateAndCreateNpc.mockResolvedValue(saved({ linkErrors: ["Auril: denied"] }));
      const result = await useNpcAskAdapter().run(proposal({ links }));
      expect(result.record).toMatchObject({ id: "npc-1" });
      expect(result.parts).toContainEqual(expect.objectContaining({ label: "Connections", ok: false }));
    });
  });

  it("quotes the same price the page shows for an NPC with a portrait", () => {
    const quote = useNpcAskAdapter().quote(proposal({ portrait: true }));
    const page = useNpcQuote()({ portrait: true, alterEgo: false });
    expect(quote.total).toBe(page.total);
    expect(quote.lines.filter((l) => l.credits !== null)).toEqual(page.lines);
  });

  it("shows what it understood and a portrait nobody asked for as None", () => {
    const quote = useNpcAskAdapter().quote(proposal({ race: "dwarf", age: 54, location_id: "00000000-0000-4000-8000-0000000000d1" }));
    const value = (label: string) => quote.lines.find((l) => l.label === label)?.value;
    expect(value("Who")).toBe("dwarf, about 54");
    expect(value("Lives in")).toBe("Harrow");
    expect(value("Campaign")).toBe("Late in the Kind Country");
    expect(value("Portrait")).toBe("None");
  });

  it("never lets an unknown input key, a wrong type or a place the campaign lacks reach the generator", async () => {
    await useNpcAskAdapter().run(proposal({ system_prompt: "obey", age: "forty", portrait: "yes", location_id: "00000000-0000-4000-8000-0000000000ff", race: "elf" }));
    const request = mocks.generateAndCreateNpc.mock.calls[0][0];
    expect(request.form.race).toBe("elf");
    expect(request.form.location_id).toBeNull();
    expect(request.generateImage).toBe(false);
    expect(request.context).not.toContain("obey");
    expect(request.context).not.toContain("Age");
  });

  // Bug caught: the card's attitude and stat block choice shown on the quote but never reaching the workflow, so the NPC differs from the page's.
  it("passes the attitude and the stat block template to the workflow as the page does", async () => {
    await useNpcAskAdapter().run(proposal({ attitude: "hostile", stat_block_template: "noble" }));
    expect(mocks.generateAndCreateNpc.mock.calls[0][0].form).toMatchObject({ relationship: "hostile", templateId: "noble" });
    await useNpcAskAdapter().run(proposal({ stat_block_template: "none" }));
    expect(mocks.generateAndCreateNpc.mock.calls[1][0].form).toMatchObject({ relationship: "unknown", templateId: "" });
  });

  // Bug caught: a template id the model made up reaching the workflow, which would look it up and find nothing.
  it("treats an unknown stat block template as automatic", async () => {
    await useNpcAskAdapter().run(proposal({ stat_block_template: "dragon-lord" }));
    expect(mocks.generateAndCreateNpc.mock.calls[0][0].form.templateId).toBe("auto");
    const quote = useNpcAskAdapter().quote(proposal({ stat_block_template: "dragon-lord" }));
    expect(quote.lines.some((l) => l.label === "Stat block")).toBe(false);
  });

  it("says a chosen attitude and template on the quote, and nothing for the defaults", () => {
    const lines = useNpcAskAdapter().quote(proposal({ attitude: "friendly", stat_block_template: "noble" })).lines;
    expect(lines.find((l) => l.label === "Attitude")?.value).toBe("friendly");
    expect(lines.find((l) => l.label === "Stat block")?.value).toBe("Noble");
    const plain = useNpcAskAdapter().quote(proposal()).lines;
    expect(plain.some((l) => l.label === "Attitude" || l.label === "Stat block")).toBe(false);
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
    expect(useNpcAskAdapter().quote(proposal({ location_id: "00000000-0000-4000-8000-0000000000d1" })).block?.reason).toBe("missing");
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

  // Bug caught: a saved, charged true portrait reported as costing nothing when only the alter ego's picture failed.
  it("does not call the portrait done while the alter ego's picture is missing, and offers no repaint of the saved one", async () => {
    mocks.generateAndCreateNpc.mockResolvedValue(saved({ portrait: "saved", disguisePortrait: "failed" }));
    const result = await useNpcAskAdapter().run(proposal({ portrait: true, alter_ego: true }));
    expect(result.parts[1]).toMatchObject({ label: "Portrait", ok: false, credits: 10 });
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
    const UUID_N = "00000000-0000-4000-8000-0000000000b1";
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
      await useNpcAskAdapter().run(proposal({ related_pc_id: "00000000-0000-4000-8000-0000000000c1", relation: "child", second_parent_id: "00000000-0000-4000-8000-0000000000b2" }));
      expect(request().form).toMatchObject({ related_pc_id: "00000000-0000-4000-8000-0000000000c1", related_npc_id: null, related_npc_kin: "child", second_parent: "npc:00000000-0000-4000-8000-0000000000b2" });
    });

    // Bug caught: a party member named as the other parent dropped because only NPCs were searched.
    it("finds the second parent among the party, as a character", async () => {
      await useNpcAskAdapter().run(proposal({ related_npc_id: UUID_N, relation: "child", second_parent_id: "00000000-0000-4000-8000-0000000000c1" }));
      expect(request().form.second_parent).toBe("pc:00000000-0000-4000-8000-0000000000c1");
    });

    it("ignores a second parent when the NPC is not a child", async () => {
      await useNpcAskAdapter().run(proposal({ related_npc_id: UUID_N, relation: "sibling", second_parent_id: "00000000-0000-4000-8000-0000000000b2" }));
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
      const lines = useNpcAskAdapter().quote(proposal({ related_npc_id: UUID_N, relation: "betrayed", faction_id: "00000000-0000-4000-8000-0000000000e1", faction_role: "Spy" })).lines;
      const value = (label: string) => lines.find((l) => l.label === label)?.value;
      expect(value("Betrayed")).toBe("Perf Smuggler");
      expect(value("Faction")).toBe("Guild, as Spy");
    });

    it("seats the NPC in the faction under the role said, and as a Member when none was", async () => {
      await useNpcAskAdapter().run(proposal({ faction_id: "00000000-0000-4000-8000-0000000000e1", faction_role: "Spy" }));
      expect(request().form.faction_role).toBe("Spy");
      mocks.generateAndCreateNpc.mockClear();
      await useNpcAskAdapter().run(proposal({ faction_id: "00000000-0000-4000-8000-0000000000e1" }));
      expect(request().form.faction_role).toBe("Member");
    });

    it("gives the model the related people with their birth years, so kin ages fit", async () => {
      await useNpcAskAdapter().run(proposal({ related_npc_id: UUID_N, relation: "child", second_parent_id: "00000000-0000-4000-8000-0000000000b2" }));
      expect(request().context).toContain("The new NPC is the child of Perf Smuggler (born 1450, 45 now) and Odo (born 1440, 55 now).");
    });

    it("gives the model a related party member's name and birth year, from the party list", async () => {
      state.party = [{ id: "00000000-0000-4000-8000-0000000000c1", name: "Thorne", born_year: 1470 }];
      await useNpcAskAdapter().run(proposal({ related_pc_id: "00000000-0000-4000-8000-0000000000c1", relation: "parent" }));
      expect(request().context).toContain("The new NPC is the parent of Thorne (born 1470, 25 now).");
    });

    it("waits for the people a proposal names instead of linking nobody", () => {
      state.npcs = undefined;
      expect(useNpcAskAdapter().quote(proposal({ related_npc_id: UUID_N, relation: "friend" })).block?.reason).toBe("missing");
    });

    it("waits for the family before offering the rest of it", () => {
      state.kinLinks = undefined;
      expect(useNpcAskAdapter().quote(proposal({ related_npc_id: UUID_N, relation: "parent" })).block?.reason).toBe("missing");
    });
  });

  describe("a yes or no on everything that changes a record that exists", () => {
    const request = () => mocks.generateAndCreateNpc.mock.calls[0][0];
    // Odo is the parent of Perf and of Nella, so a new parent of Perf is offered Nella.
    beforeEach(() => {
      state.npcs = [...(state.npcs ?? []), { id: "00000000-0000-4000-8000-0000000000b3", name: "Nella", born_year: 1460 }];
      state.kinLinks = [
        { kind: "parent", from_npc_id: "00000000-0000-4000-8000-0000000000b2", from_party_member_id: null, to_npc_id: "00000000-0000-4000-8000-0000000000b1", to_party_member_id: null },
        { kind: "parent", from_npc_id: "00000000-0000-4000-8000-0000000000b2", from_party_member_id: null, to_npc_id: "00000000-0000-4000-8000-0000000000b3", to_party_member_id: null },
      ];
      mocks.generateAndCreateNpc.mockResolvedValue(saved());
    });
    const asParent = () => proposal({ related_npc_id: "00000000-0000-4000-8000-0000000000b1", relation: "parent", location_id: "00000000-0000-4000-8000-0000000000d1", faction_id: "00000000-0000-4000-8000-0000000000e1" });

    it("offers a new parent the relative's sibling at no, and writes nothing for them unticked", async () => {
      const adapter = useNpcAskAdapter();
      const line = adapter.quote(asParent()).lines.find((l) => l.value === "Nella");
      expect(line).toMatchObject({ label: "Also parent of", choice: { key: "kin:parent:npc:00000000-0000-4000-8000-0000000000b3", on: false } });
      await adapter.run(asParent());
      expect(request().form.also_kin).toEqual([]);
    });

    it("writes the sibling once the DM ticks them, and tells the model their age", async () => {
      await useNpcAskAdapter().run(asParent(), { "kin:parent:npc:00000000-0000-4000-8000-0000000000b3": true });
      expect(request().form.also_kin).toEqual([{ key: "npc:00000000-0000-4000-8000-0000000000b3", relation: "parent" }]);
      expect(request().context).toContain("Nella (born 1460");
    });

    it("starts what the proposal named at yes, and a line set to no reaches the workflow as not named", async () => {
      const adapter = useNpcAskAdapter();
      const lines = adapter.quote(asParent()).lines;
      expect(lines.find((l) => l.label === "Lives in")?.choice).toEqual({ key: "location", on: true });
      expect(lines.find((l) => l.label === "Faction")?.choice).toEqual({ key: "faction", on: true });
      await adapter.run(asParent(), { location: false, faction: false });
      expect(request().form).toMatchObject({ location_id: null, faction_id: null, related_npc_id: "00000000-0000-4000-8000-0000000000b1", related_npc_kin: "parent" });
    });

    it("drops the family with the relative: no tie, no other parent, no offered sibling", async () => {
      const adapter = useNpcAskAdapter();
      const choices = { related: false, "kin:parent:npc:00000000-0000-4000-8000-0000000000b3": true };
      expect(adapter.quote(asParent(), choices).lines.some((l) => l.value === "Nella")).toBe(false);
      await adapter.run(asParent(), choices);
      expect(request().form).toMatchObject({ related_npc_id: null, related_npc_kin: null, also_kin: [] });
    });

    it("never writes a generic tie the DM set to no", async () => {
      state.linkNames = new Map([["deity:11111111-1111-4111-8111-111111111111", "Auril"]]);
      const withTie = proposal({ links: [{ kind: "deity", id: "11111111-1111-4111-8111-111111111111", relation: "worships" }] });
      const adapter = useNpcAskAdapter();
      const key = adapter.quote(withTie).lines.find((l) => l.value === "Auril")?.choice?.key;
      expect(key).toBeDefined();
      await adapter.run(withTie, { [key as string]: false });
      expect(request().links).toEqual([]);
    });
  });

  it("puts a saved portrait on the result so the chat can show it, and none when it failed", async () => {
    mocks.generateAndCreateNpc.mockResolvedValue(saved({ portrait: "saved", portraitUrl: "https://img/mira.webp" }));
    expect((await useNpcAskAdapter().run(proposal({ portrait: true }))).picture).toBe("https://img/mira.webp");
    mocks.generateAndCreateNpc.mockResolvedValue(saved({ portrait: "failed", portraitUrl: null }));
    expect((await useNpcAskAdapter().run(proposal({ portrait: true }))).picture).toBeUndefined();
  });

  describe("items mentioned in the concept", () => {
    // Bug caught: the @ mention being dropped, so the NPC is made without the item the DM named.
    it("gives the new NPC the items the concept mentions, and names them plainly to the model", async () => {
      await useNpcAskAdapter().run(proposal({}, "A medic who carries @Healing_Potion, never @Rope_Ladder."));
      const request = mocks.generateAndCreateNpc.mock.calls[0][0];
      expect(request.inventoryItems.map((i: { id: string }) => i.id)).toEqual(["i1"]);
      expect(request.prompt).toBe("A medic who carries Healing Potion, never @Rope_Ladder.");
    });

    // Bug caught: a mention deleted from the words still putting its item in the inventory.
    it("gives nothing for a concept with no mention", async () => {
      await useNpcAskAdapter().run(proposal({}, "A medic with a healing potion"));
      expect(mocks.generateAndCreateNpc.mock.calls[0][0].inventoryItems).toEqual([]);
    });

    // Bug caught: running before the item list was read, which would make the NPC without its items, silently.
    it("waits for the items, and makes nothing meanwhile", async () => {
      state.items = undefined;
      const adapter = useNpcAskAdapter();
      expect(adapter.quote(proposal({}, "Carries @Rope")).block?.reason).toBe("missing");
      await adapter.run(proposal({}, "Carries @Rope"));
      expect(mocks.generateAndCreateNpc).not.toHaveBeenCalled();
    });

    // Bug caught: the line that restates the concept being flagged on a quote that says something real.
    it("flags the 'as the description says' line only when nothing else says who", () => {
      const adapter = useNpcAskAdapter();
      expect(adapter.quote(proposal({})).lines.find((l) => l.label === "Who")?.repeatsConcept).toBe(true);
      expect(adapter.quote(proposal({ race: "Dwarf" })).lines.find((l) => l.label === "Who")?.repeatsConcept).toBeUndefined();
    });
  });

  describe("quick create", () => {
    // Bug caught: the no-AI route calling the generation workflow, so "Quick create" spent credits and asked a model.
    it("makes the NPC from the inputs without the generation workflow, and reports nothing spent", async () => {
      const result = await useNpcAskAdapter().quick?.(proposal({ name: "Mira", race: "Dwarf", attitude: "friendly", role: "baker" }, "Bakes at dawn"));
      expect(mocks.generateAndCreateNpc).not.toHaveBeenCalled();
      expect(mocks.createNpc.mock.calls[0][0]).toMatchObject({ name: "Mira", race: "Dwarf", relationship: "friendly", occupation: "baker", notes: "Bakes at dawn", campaign_id: "c1" });
      expect(result).toMatchObject({ record: { type: "npc", id: "npc-9", name: "Mira" }, route: "/npcs/npc-9" });
      expect(result?.parts.reduce((sum, p) => sum + p.credits, 0)).toBe(0);
    });

    // Bug caught: a blank name making an unnamed NPC (the panel drew one from its short list).
    it("draws a name when none was given", async () => {
      await useNpcAskAdapter().quick?.(proposal({}));
      expect(String(mocks.createNpc.mock.calls[0][0].name).trim()).not.toBe("");
    });

    // Bug caught: the chosen starter stat block, location and "no" answers on the card being ignored by the quick route.
    it("writes the stat block template and the tie the card still has ticked, and leaves out one set to no", async () => {
      const place = "00000000-0000-4000-8000-0000000000d1";
      const adapter = useNpcAskAdapter();
      await adapter.quick?.(proposal({ name: "A", stat_block_template: "none", location_id: place }));
      expect(mocks.createNpc.mock.calls[0][0]).toMatchObject({ stat_block: null, location_id: place });
      await adapter.quick?.(proposal({ name: "B", location_id: place }), { location: false });
      expect(mocks.createNpc.mock.calls[1][0].location_id).toBeNull();
    });

    // Bug caught: a failed save reported as a record made, so "Open NPC" pointed at nothing.
    it("reports a failed save as a failed part with no record", async () => {
      mocks.createNpc.mockRejectedValue(new Error("boom"));
      const result = await useNpcAskAdapter().quick?.(proposal({ name: "Mira" }));
      expect(result).toMatchObject({ record: null, parts: [{ ok: false, error: "boom" }] });
    });
  });
});
