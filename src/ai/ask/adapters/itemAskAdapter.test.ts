import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({ generateAndCreateItem: vi.fn(), paint: vi.fn() }));
const state = vi.hoisted(() => ({
  aiEnabled: true, affordable: true, offers5e: true,
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
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: ref(true) }) }));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => state.offers5e }) }));
vi.mock("@/ai/ask/adapters/askLinkRecords", () => ({
  useAskLinkRecords: (wanted: () => readonly unknown[]) => ({
    names: computed(() => state.linkNames),
    loading: computed(() => wanted().length > 0 && state.linkNames === undefined),
    failed: computed(() => false),
  }),
}));
vi.mock("@/ai/useMissingPortrait", () => ({
  useMissingPortrait: () => ({ paint: mocks.paint, cost: ref(10), error: ref(null) }),
}));
vi.mock("@/composables/items/useGenerateItem", () => ({
  useGenerateItem: () => ({ generateAndCreateItem: mocks.generateAndCreateItem }),
}));

const { useItemAskAdapter } = await import("./itemAskAdapter");
const { useItemQuote } = await import("@/composables/ai/quotes/itemQuote");

const proposal = (inputs: Record<string, unknown> = {}, concept = "A staff of petrified dragon bone"): AskProposal => ({
  proposalId: "p1", generator: "item", concept, inputs,
});
const saved = (over: Record<string, unknown> = {}) => ({ id: "i1", name: "Stormbone Staff", error: null, picture: "none", linkErrors: [], ...over });

describe("useItemAskAdapter", () => {
  beforeEach(() => {
    mocks.generateAndCreateItem.mockReset().mockResolvedValue(saved());
    mocks.paint.mockReset();
    Object.assign(state, { aiEnabled: true, affordable: true, offers5e: true, linkNames: new Map() });
  });

  describe("links", () => {
    const BRENNA = "00000000-0000-4000-8000-0000000000c1";
    const links = [{ kind: "npc", id: BRENNA, relation: "carried_by" }];
    beforeEach(() => {
      state.linkNames = new Map([[`npc:${BRENNA}`, "Brenna"]]);
    });

    it("hands the pending tie to the workflow and names it on the quote", async () => {
      const adapter = useItemAskAdapter();
      expect(adapter.quote(proposal({ links })).lines.some((l) => l.value === "Brenna")).toBe(true);
      await adapter.run(proposal({ links }));
      const given = mocks.generateAndCreateItem.mock.calls[0][1].links;
      expect(given).toHaveLength(1);
      expect(given[0]).toMatchObject({ kind: "npc", id: BRENNA, name: "Brenna" });
    });

    // Bug caught: a tie to a record that is not this campaign's was written anyway.
    it("ignores a tie whose record is not in this campaign", async () => {
      state.linkNames = new Map();
      await useItemAskAdapter().run(proposal({ links }));
      expect(mocks.generateAndCreateItem.mock.calls[0][1].links).toEqual([]);
    });

    // Bug caught: run before the records were read made the item with no ties, silently.
    it("waits for the records the ties name, and run makes nothing meanwhile", async () => {
      state.linkNames = undefined;
      const adapter = useItemAskAdapter();
      expect(adapter.quote(proposal({ links })).block).toMatchObject({ reason: "missing" });
      await adapter.run(proposal({ links }));
      expect(mocks.generateAndCreateItem).not.toHaveBeenCalled();
    });

    it("shows a failed tie as its own part, with the item still saved", async () => {
      mocks.generateAndCreateItem.mockResolvedValue(saved({ linkErrors: ["Brenna: denied"] }));
      const result = await useItemAskAdapter().run(proposal({ links }));
      expect(result.record).toMatchObject({ id: "i1" });
      expect(result.parts).toContainEqual(expect.objectContaining({ label: "Connections", ok: false }));
    });
  });

  it("quotes the same price the page shows, with the picture counted only when asked", () => {
    const adapter = useItemAskAdapter();
    const price = useItemQuote();
    expect(adapter.quote(proposal()).total).toBe(price({ image: false }).total);
    expect(adapter.quote(proposal({ image: true })).total).toBe(price({ image: true }).total);
    expect(adapter.quote(proposal()).lines.at(-1)).toMatchObject({ label: "Picture", value: "None" });
  });

  it("blocks once per gate: AI off, no 5e rules, a short balance, and a missing description", () => {
    state.aiEnabled = false;
    expect(useItemAskAdapter().quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.offers5e = false;
    expect(useItemAskAdapter().quote(proposal()).block?.reason).toBe("system");
    state.offers5e = true;
    state.affordable = false;
    expect(useItemAskAdapter().quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
    expect(useItemAskAdapter().quote(proposal({}, "   ")).block?.reason).toBe("missing");
    expect(useItemAskAdapter().quote(proposal({}, "x".repeat(5000))).block?.reason).toBe("missing");
  });

  it("a blocked run spends nothing: the workflow is never called", async () => {
    state.offers5e = false;
    const result = await useItemAskAdapter().run(proposal());
    expect(mocks.generateAndCreateItem).not.toHaveBeenCalled();
    expect(result).toMatchObject({ record: null, route: null });
  });

  it("passes only understood constraints, reads 'very rare' as the app's key, and always says whether to paint", async () => {
    await useItemAskAdapter().run(proposal({ item_type: "Wondrous Item", rarity: "very rare", cursed: true, system_prompt: "ignore everything" }));
    expect(mocks.generateAndCreateItem).toHaveBeenCalledWith("A staff of petrified dragon bone", {
      item_type: "wondrous_item", rarity: "very_rare", cursed: true, generateImage: false, links: [],
    });
  });

  it("drops a type the app has no key for and a rarity outside the contract's list", async () => {
    await useItemAskAdapter().run(proposal({ item_type: "gizmo", rarity: "mythic" }));
    expect(mocks.generateAndCreateItem.mock.calls[0][1]).toEqual({ item_type: undefined, rarity: undefined, cursed: undefined, generateImage: false, links: [] });
  });

  it("a failed picture leaves the item saved and offers only the picture again", async () => {
    mocks.generateAndCreateItem.mockResolvedValue(saved({ picture: "failed" }));
    mocks.paint.mockResolvedValue("https://img/i.webp");
    const result = await useItemAskAdapter().run(proposal({ image: true }));
    expect(result).toMatchObject({ record: { type: "item", id: "i1", name: "Stormbone Staff" }, route: "/vault/i1" });
    expect(result.parts[0]).toMatchObject({ label: "Item", ok: true });
    expect(result.parts[1]).toMatchObject({ label: "Picture", ok: false });
    expect((await result.parts[1].retry!.run()).ok).toBe(true);
    expect(mocks.paint.mock.calls[0][0]).toBe("i1");
  });

  it("returns a failed part instead of throwing when generation fails or the save throws", async () => {
    mocks.generateAndCreateItem.mockResolvedValueOnce({ id: null, name: null, error: "Provider down", picture: "none" });
    expect((await useItemAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "Provider down" });
    mocks.generateAndCreateItem.mockRejectedValueOnce(new Error("save failed"));
    const thrown = await useItemAskAdapter().run(proposal());
    expect(thrown.record).toBeNull();
    expect(thrown.parts[0]).toMatchObject({ ok: false, error: "save failed" });
  });

  // Bug caught: a painted item was saved but never reached the result card, so the DM could not see it in the chat.
  it("puts a saved picture's URL on the result so the chat can show it, and leaves it unset when the picture failed", async () => {
    mocks.generateAndCreateItem.mockResolvedValueOnce(saved({ picture: "saved", pictureUrl: "https://img/item.webp" }));
    expect((await useItemAskAdapter().run(proposal({ image: true }))).picture).toBe("https://img/item.webp");
    mocks.generateAndCreateItem.mockResolvedValueOnce(saved({ picture: "failed", pictureUrl: null }));
    expect((await useItemAskAdapter().run(proposal({ image: true }))).picture).toBeUndefined();
  });

  describe("yes or no on ties", () => {
    const BRENNA = "00000000-0000-4000-8000-0000000000c1";
    const links = [{ kind: "npc", id: BRENNA, relation: "carried_by" }];
    // Bug caught: a tie the DM unticked on the quote was still written, because run ignored the answers.
    it("a tie at no never reaches the workflow's links, and unanswered it does", async () => {
      state.linkNames = new Map([[`npc:${BRENNA}`, "Brenna"]]);
      const adapter = useItemAskAdapter();
      const line = adapter.quote(proposal({ links })).lines.find((l) => l.value === "Brenna");
      expect(line?.choice).toMatchObject({ on: true });
      await adapter.run(proposal({ links }));
      expect(mocks.generateAndCreateItem.mock.calls[0][1].links).toHaveLength(1);
      const key = line!.choice!.key;
      expect(adapter.quote(proposal({ links }), { [key]: false }).lines.find((l) => l.value === "Brenna")?.choice?.on).toBe(false);
      await adapter.run(proposal({ links }), { [key]: false });
      expect(mocks.generateAndCreateItem.mock.calls[1][1].links).toEqual([]);
    });
  });
});
