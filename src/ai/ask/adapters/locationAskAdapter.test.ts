import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({ generateAndCreateLocation: vi.fn() }));
const state = vi.hoisted(() => ({
  aiEnabled: true, canCreate: true, affordable: true,
  places: undefined as { id: string; name: string }[] | undefined,
  npcs: undefined as { id: string; name: string }[] | undefined,
  /** `kind:id` to name for the records the ties name; undefined while "reading". */
  linkNames: new Map<string, string>() as Map<string, string> | undefined,
}));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ get isAiEnabled() { return state.aiEnabled; }, activeCampaign: { name: "Sugarwell" } }),
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
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => true }) }));
vi.mock("@/composables/locations/useLocations", () => ({
  useAllLocations: () => ({ data: { get value() { return state.places; } } }),
}));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: { get value() { return state.npcs; } } }) }));
vi.mock("@/ai/ask/adapters/askLinkRecords", () => ({
  useAskLinkRecords: (wanted: () => readonly unknown[]) => ({
    names: computed(() => state.linkNames),
    loading: computed(() => wanted().length > 0 && state.linkNames === undefined),
    failed: computed(() => false),
  }),
}));
vi.mock("@/composables/locations/useGenerateLocation", () => ({
  useGenerateLocation: () => ({ generateAndCreateLocation: mocks.generateAndCreateLocation }),
}));

const { useLocationAskAdapter } = await import("./locationAskAdapter");
const { useLocationQuote } = await import("@/composables/ai/quotes/locationQuote");

const proposal = (inputs: Record<string, unknown> = {}, concept = "A crumbling dwarven forge district"): AskProposal => ({
  proposalId: "p1", generator: "location", concept, inputs,
});
const saved = (over: Record<string, unknown> = {}) => ({ id: "l1", name: "Forgeholm", error: null, picture: "none", map: "none", linkErrors: [], ...over });

describe("useLocationAskAdapter", () => {
  beforeEach(() => {
    mocks.generateAndCreateLocation.mockReset().mockResolvedValue(saved());
    Object.assign(state, { aiEnabled: true, canCreate: true, affordable: true, places: [{ id: "p1", name: "Thornkeep" }], npcs: [{ id: "n1", name: "Brenna" }], linkNames: new Map() });
  });

  describe("links", () => {
    const RED_HAND = "00000000-0000-4000-8000-0000000000b1";
    const links = [{ kind: "faction", id: RED_HAND, relation: "controlled_by" }];
    beforeEach(() => {
      state.linkNames = new Map([[`faction:${RED_HAND}`, "The Red Hand"]]);
    });

    it("names the tie on the quote and hands the pending tie to the workflow", async () => {
      const adapter = useLocationAskAdapter();
      expect(adapter.quote(proposal({ links })).lines.some((l) => l.value === "The Red Hand")).toBe(true);
      await adapter.run(proposal({ links }));
      const given = mocks.generateAndCreateLocation.mock.calls[0][1].links;
      expect(given).toHaveLength(1);
      expect(given[0]).toMatchObject({ kind: "faction", id: RED_HAND, name: "The Red Hand" });
    });

    // Bug caught: a tie to a record that is not this campaign's was written anyway.
    it("ignores a tie whose record is not in this campaign", async () => {
      state.linkNames = new Map();
      await useLocationAskAdapter().run(proposal({ links }));
      expect(mocks.generateAndCreateLocation.mock.calls[0][1].links).toEqual([]);
    });

    // Bug caught: run before the records were read made the place with no ties, silently.
    it("waits for the records the ties name, and run makes nothing meanwhile", async () => {
      state.linkNames = undefined;
      const adapter = useLocationAskAdapter();
      expect(adapter.quote(proposal({ links })).block).toMatchObject({ reason: "missing" });
      await adapter.run(proposal({ links }));
      expect(mocks.generateAndCreateLocation).not.toHaveBeenCalled();
    });

    it("shows a failed tie as its own part, with the place still saved", async () => {
      mocks.generateAndCreateLocation.mockResolvedValue(saved({ linkErrors: ["The Red Hand: denied"] }));
      const result = await useLocationAskAdapter().run(proposal({ links }));
      expect(result.record).toMatchObject({ id: "l1" });
      expect(result.parts).toContainEqual(expect.objectContaining({ label: "Connections", ok: false }));
    });
  });

  it("quotes the same price the page shows, with the picture counted only when asked and never a map", () => {
    const adapter = useLocationAskAdapter();
    const price = useLocationQuote();
    expect(adapter.quote(proposal()).total).toBe(price({ image: false }).total);
    expect(adapter.quote(proposal({ image: true })).total).toBe(price({ image: true, map: false }).total);
    expect(adapter.quote(proposal({ image: true })).lines.map((l) => l.label)).not.toContain("Map sketch");
  });

  it("blocks once per gate: AI off, the plan's place limit, a short balance, a missing description", () => {
    state.aiEnabled = false;
    expect(useLocationAskAdapter().quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.canCreate = false;
    expect(useLocationAskAdapter().quote(proposal()).block?.reason).toBe("quota");
    state.canCreate = true;
    state.affordable = false;
    expect(useLocationAskAdapter().quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
    expect(useLocationAskAdapter().quote(proposal({}, " ")).block?.reason).toBe("missing");
  });

  it("waits for the Atlas before it quotes a parent, and says so", () => {
    state.places = undefined;
    expect(useLocationAskAdapter().quote(proposal({ parent_id: "p1" })).block).toMatchObject({ reason: "missing" });
  });

  it("puts an NPC of this campaign in charge of the place, names them in the quote, and ignores one it lacks", async () => {
    const adapter = useLocationAskAdapter();
    expect(adapter.quote(proposal({ keeper_npc_id: "n1" })).lines.find((l) => l.label === "Kept by")?.value).toBe("Brenna");
    await adapter.run(proposal({ keeper_npc_id: "n1" }));
    expect(mocks.generateAndCreateLocation.mock.calls[0][1]).toMatchObject({ keeperNpcId: "n1" });
    await adapter.run(proposal({ keeper_npc_id: "other-campaign" }));
    expect(mocks.generateAndCreateLocation.mock.calls[1][1]).toMatchObject({ keeperNpcId: null });
    state.npcs = undefined;
    expect(useLocationAskAdapter().quote(proposal({ keeper_npc_id: "n1" })).block?.reason).toBe("missing");
  });

  it("files the place under a parent of this campaign, and ignores a parent id that is not one", async () => {
    await useLocationAskAdapter().run(proposal({ parent_id: "p1", location_type: "City" }));
    expect(mocks.generateAndCreateLocation.mock.calls[0][1]).toEqual({
      locationType: "city", parent: { id: "p1", name: "Thornkeep" }, keeperNpcId: null, generateImage: false, generateMap: false, links: [],
    });
    await useLocationAskAdapter().run(proposal({ parent_id: "someone-elses-place", location_type: "lair of doom", system_prompt: "x" }));
    expect(mocks.generateAndCreateLocation.mock.calls[1][1]).toEqual({
      locationType: undefined, parent: null, keeperNpcId: null, generateImage: false, generateMap: false, links: [],
    });
  });

  it("a blocked run spends nothing: the workflow is never called", async () => {
    state.canCreate = false;
    await useLocationAskAdapter().run(proposal());
    expect(mocks.generateAndCreateLocation).not.toHaveBeenCalled();
  });

  it("a failed picture leaves the place saved, and offers no retry because no paint flow exists for places", async () => {
    mocks.generateAndCreateLocation.mockResolvedValue(saved({ picture: "failed" }));
    const result = await useLocationAskAdapter().run(proposal({ image: true }));
    expect(result).toMatchObject({ record: { type: "location", id: "l1", name: "Forgeholm" }, route: "/locations?at=l1" });
    expect(result.parts[0]).toMatchObject({ label: "Place", ok: true });
    expect(result.parts[1]).toMatchObject({ label: "Picture", ok: false });
    expect(result.parts[1].retry).toBeUndefined();
  });

  it("returns a failed part instead of throwing when generation fails or the save throws, and names a quota race", async () => {
    mocks.generateAndCreateLocation.mockResolvedValueOnce({ id: null, name: null, error: "Provider down", picture: "none", map: "none" });
    expect((await useLocationAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "Provider down" });
    mocks.generateAndCreateLocation.mockRejectedValueOnce(new Error("save failed"));
    expect((await useLocationAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "save failed" });
    mocks.generateAndCreateLocation.mockRejectedValueOnce({ message: "quota_exceeded" });
    expect((await useLocationAskAdapter().run(proposal())).parts[0].error).toContain("limit of places");
  });
});
