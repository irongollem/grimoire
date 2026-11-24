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
    imageProvider: ref("openai"),
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
    Object.assign(state, { aiEnabled: true, canCreate: true, affordable: true, places: [{ id: "00000000-0000-4000-8000-000000000021", name: "Thornkeep" }], npcs: [{ id: "00000000-0000-4000-8000-000000000001", name: "Brenna" }], linkNames: new Map() });
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

  // Bug caught: the map sketch switch was dropped (the adapter hard-wired it off), so a DM who asked for one was neither charged nor given one.
  it("charges for the map sketch and asks for it only when the card's switch is on", async () => {
    const adapter = useLocationAskAdapter();
    const price = useLocationQuote();
    const withMap = adapter.quote(proposal({ map: true }));
    expect(withMap.total).toBe(price({ image: false, map: true }).total);
    expect(withMap.lines.map((l) => l.label)).toContain("Map sketch");
    await adapter.run(proposal({ map: true, image: true }));
    expect(mocks.generateAndCreateLocation.mock.calls[0][1]).toMatchObject({ generateImage: true, generateMap: true });
    await adapter.run(proposal({ image: true }));
    expect(mocks.generateAndCreateLocation.mock.calls[1][1]).toMatchObject({ generateMap: false });
  });

  // Bug caught: a map sketch that failed to paint vanished from the result, so the DM paid for a sketch the notice never mentioned.
  it("says when the map sketch did not paint, and leaves the place saved", async () => {
    mocks.generateAndCreateLocation.mockResolvedValue(saved({ map: "failed" }));
    const result = await useLocationAskAdapter().run(proposal({ map: true }));
    expect(result.record).toMatchObject({ id: "l1" });
    expect(result.parts.find((p) => p.label === "Map sketch")).toMatchObject({ ok: false });
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
    expect(useLocationAskAdapter().quote(proposal({ parent_id: "00000000-0000-4000-8000-000000000021" })).block).toMatchObject({ reason: "missing" });
  });

  it("puts an NPC of this campaign in charge of the place, names them in the quote, and ignores one it lacks", async () => {
    const adapter = useLocationAskAdapter();
    expect(adapter.quote(proposal({ keeper_npc_id: "00000000-0000-4000-8000-000000000001" })).lines.find((l) => l.label === "Kept by")?.value).toBe("Brenna");
    await adapter.run(proposal({ keeper_npc_id: "00000000-0000-4000-8000-000000000001" }));
    expect(mocks.generateAndCreateLocation.mock.calls[0][1]).toMatchObject({ keeperNpcId: "00000000-0000-4000-8000-000000000001" });
    await adapter.run(proposal({ keeper_npc_id: "00000000-0000-4000-8000-000000000099" }));
    expect(mocks.generateAndCreateLocation.mock.calls[1][1]).toMatchObject({ keeperNpcId: null });
    state.npcs = undefined;
    expect(useLocationAskAdapter().quote(proposal({ keeper_npc_id: "00000000-0000-4000-8000-000000000001" })).block?.reason).toBe("missing");
  });

  it("files the place under a parent of this campaign, and ignores a parent id that is not one", async () => {
    await useLocationAskAdapter().run(proposal({ parent_id: "00000000-0000-4000-8000-000000000021", location_type: "City" }));
    expect(mocks.generateAndCreateLocation.mock.calls[0][1]).toEqual({
      locationType: "city", parent: { id: "00000000-0000-4000-8000-000000000021", name: "Thornkeep" }, keeperNpcId: null, generateImage: false, generateMap: false, links: [],
    });
    await useLocationAskAdapter().run(proposal({ parent_id: "00000000-0000-4000-8000-000000000098", location_type: "lair of doom", system_prompt: "x" }));
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

  // Bug caught: a painted place was saved but never reached the result card, so the DM could not see it in the chat.
  it("puts a saved picture's URL on the result so the chat can show it, and leaves it unset when the picture failed", async () => {
    mocks.generateAndCreateLocation.mockResolvedValueOnce(saved({ picture: "saved", pictureUrl: "https://img/place.webp" }));
    expect((await useLocationAskAdapter().run(proposal({ image: true }))).picture).toBe("https://img/place.webp");
    mocks.generateAndCreateLocation.mockResolvedValueOnce(saved({ picture: "failed", pictureUrl: null }));
    expect((await useLocationAskAdapter().run(proposal({ image: true }))).picture).toBeUndefined();
  });

  describe("yes or no on ties to existing records", () => {
    // Bug caught: unticking the parent or the keeper on the quote still wrote them.
    it("parent and keeper lines carry their field as the key; at no the workflow gets null for that field only", async () => {
      const adapter = useLocationAskAdapter();
      const inputs = { parent_id: "00000000-0000-4000-8000-000000000021", keeper_npc_id: "00000000-0000-4000-8000-000000000001" };
      const lines = adapter.quote(proposal(inputs)).lines;
      expect(lines.find((l) => l.label === "Inside")?.choice).toEqual({ key: "parent_id", on: true });
      expect(lines.find((l) => l.label === "Kept by")?.choice).toEqual({ key: "keeper_npc_id", on: true });
      await adapter.run(proposal(inputs));
      expect(mocks.generateAndCreateLocation.mock.calls[0][1]).toMatchObject({ parent: { id: "00000000-0000-4000-8000-000000000021" }, keeperNpcId: "00000000-0000-4000-8000-000000000001" });
      await adapter.run(proposal(inputs), { parent_id: false });
      expect(mocks.generateAndCreateLocation.mock.calls[1][1]).toMatchObject({ parent: null, keeperNpcId: "00000000-0000-4000-8000-000000000001" });
      await adapter.run(proposal(inputs), { keeper_npc_id: false });
      expect(mocks.generateAndCreateLocation.mock.calls[2][1]).toMatchObject({ parent: { id: "00000000-0000-4000-8000-000000000021" }, keeperNpcId: null });
    });

    // Bug caught: a tie the DM unticked was still written, because run read the unfiltered list.
    it("a tie at no never reaches the workflow's links", async () => {
      const RED_HAND = "00000000-0000-4000-8000-0000000000b1";
      const links = [{ kind: "faction", id: RED_HAND, relation: "controlled_by" }];
      state.linkNames = new Map([[`faction:${RED_HAND}`, "The Red Hand"]]);
      const adapter = useLocationAskAdapter();
      const key = adapter.quote(proposal({ links })).lines.find((l) => l.value === "The Red Hand")!.choice!.key;
      await adapter.run(proposal({ links }), { [key]: false });
      expect(mocks.generateAndCreateLocation.mock.calls[0][1].links).toEqual([]);
    });
  });
});
