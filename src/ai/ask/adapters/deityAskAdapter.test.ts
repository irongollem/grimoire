import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({ generateAndCreateDeity: vi.fn() }));
const state = vi.hoisted(() => ({ aiEnabled: true, canCreate: true, affordable: true, pantheons: undefined as unknown, deities: undefined as unknown, linkNames: new Map<string, string>() as Map<string, string> | undefined }));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isAiEnabled() { return state.aiEnabled; },
    activeCampaign: { name: "Sugarwell" },
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
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => true }) }));
vi.mock("@/composables/deities/useDeities", () => ({
  useAllPantheons: () => ({ data: { get value() { return state.pantheons; } } }),
  useAllDeities: () => ({ data: { get value() { return state.deities; } } }),
}));
vi.mock("@/ai/ask/adapters/askLinkRecords", () => ({
  useAskLinkRecords: (wanted: () => readonly unknown[]) => ({
    names: computed(() => state.linkNames),
    loading: computed(() => wanted().length > 0 && state.linkNames === undefined),
    failed: computed(() => false),
  }),
}));
vi.mock("@/composables/deities/useGenerateDeity", () => ({
  useGenerateDeity: () => ({ generateAndCreateDeity: mocks.generateAndCreateDeity }),
}));

const { typeChoices } = await import("@/lib/worldLinks/connections");
const { useDeityAskAdapter } = await import("./deityAskAdapter");
const { useDeityQuote } = await import("@/composables/ai/quotes/deityQuote");

const proposal = (inputs: Record<string, unknown> = {}, concept = "A weary goddess of crossroads"): AskProposal => ({
  proposalId: "p1", generator: "deity", concept, inputs,
});
const saved = (over: Record<string, unknown> = {}) => ({
  deity: { id: "d1", name: "Vesper", campaignId: "c1", notesFailure: null, linkErrors: [] }, error: null, picture: "none", ...over,
});

describe("useDeityAskAdapter", () => {
  beforeEach(() => {
    mocks.generateAndCreateDeity.mockReset();
    Object.assign(state, {
      aiEnabled: true, canCreate: true, affordable: true,
      pantheons: [{ id: "pan1", name: "The Hollow Court" }], deities: [{ pantheon_id: "pan1", name: "Orrin", portfolio: "frost" }],
    });
    state.linkNames = new Map();
    mocks.generateAndCreateDeity.mockResolvedValue(saved());
  });

  describe("links", () => {
    const GUILD = "00000000-0000-4000-8000-0000000000a1";
    const TEMPLE = "00000000-0000-4000-8000-0000000000a2";
    const word = (to: "faction" | "location") => typeChoices("deity", to)[0]!.word.replaceAll(" ", "_");
    const links = [
      { kind: "faction", id: GUILD, relation: word("faction") },
      { kind: "location", id: TEMPLE, relation: word("location") },
    ];
    beforeEach(() => {
      state.linkNames = new Map([[`faction:${GUILD}`, "The Guild"], [`location:${TEMPLE}`, "The Temple"]]);
    });

    it("names each tie on the quote and hands the page's own pending ties to the workflow", async () => {
      const adapter = useDeityAskAdapter();
      const quote = adapter.quote(proposal({ links }));
      expect(quote.lines.filter((l) => l.value === "The Guild" || l.value === "The Temple")).toHaveLength(2);
      await adapter.run(proposal({ links }));
      const request = mocks.generateAndCreateDeity.mock.calls[0][1];
      expect(request.links.map((l: { kind: string; id: string; name: string }) => [l.kind, l.id, l.name])).toEqual([
        ["faction", GUILD, "The Guild"], ["location", TEMPLE, "The Temple"],
      ]);
    });

    // Bug caught: a link to a record that is not this campaign's was tied anyway.
    it("ignores a tie whose record is not in this campaign", async () => {
      state.linkNames = new Map([[`faction:${GUILD}`, "The Guild"]]);
      await useDeityAskAdapter().run(proposal({ links }));
      expect(mocks.generateAndCreateDeity.mock.calls[0][1].links).toHaveLength(1);
    });

    // Bug caught: run before the records were read made the deity with no ties, silently.
    it("waits for the records the ties name, and run makes nothing meanwhile", async () => {
      state.linkNames = undefined;
      const adapter = useDeityAskAdapter();
      expect(adapter.quote(proposal({ links })).block).toMatchObject({ reason: "missing", message: "Still reading the records it is tied to." });
      await adapter.run(proposal({ links }));
      expect(mocks.generateAndCreateDeity).not.toHaveBeenCalled();
    });

    it("shows a failed tie as its own part, with the deity still saved", async () => {
      mocks.generateAndCreateDeity.mockResolvedValue(saved({ deity: { id: "d1", name: "Vesper", campaignId: "c1", notesFailure: null, linkErrors: ["The Guild: denied"] } }));
      const result = await useDeityAskAdapter().run(proposal({ links }));
      expect(result.record).toMatchObject({ id: "d1" });
      expect(result.parts).toContainEqual(expect.objectContaining({ label: "Connections", ok: false }));
    });
  });

  it("quotes the same price the page shows, with the picture counted only when asked", () => {
    const adapter = useDeityAskAdapter();
    const pageQuote = useDeityQuote();
    expect(adapter.quote(proposal()).total).toBe(pageQuote({ image: false }).total);
    expect(adapter.quote(proposal({ image: true })).total).toBe(pageQuote({ image: true }).total);
  });

  it("blocks once per gate: AI off, deity quota, short balance, and an empty description", () => {
    const adapter = useDeityAskAdapter();
    state.aiEnabled = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.canCreate = false;
    const quota = adapter.quote(proposal()).block;
    expect(quota?.reason).toBe("quota");
    expect(quota?.message).toContain("deities");
    state.canCreate = true;
    state.affordable = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
    expect(adapter.quote(proposal({}, "  ")).block?.reason).toBe("missing");
  });

  it("does not run a blocked quote, and spends nothing", async () => {
    state.canCreate = false;
    const result = await useDeityAskAdapter().run(proposal());
    expect(mocks.generateAndCreateDeity).not.toHaveBeenCalled();
    expect(result.record).toBeNull();
    expect(result.parts[0]).toMatchObject({ ok: false });
  });

  it("passes only understood constraints, the matched pantheon, and always says explicitly whether to paint", async () => {
    await useDeityAskAdapter().run(proposal({
      pantheon_id: "pan1", alignment: "neutral good", domain: "Trickery", system_prompt: "x", image: false,
    }));
    expect(mocks.generateAndCreateDeity).toHaveBeenCalledWith("A weary goddess of crossroads", {
      pantheon: { id: "pan1", name: "The Hollow Court" },
      deities: [{ pantheon_id: "pan1", name: "Orrin", portfolio: "frost" }],
      alignment: "Neutral Good",
      primaryDomain: "Trickery",
      generateImage: false,
      links: [],
    });
  });

  it("does not understand a pantheon id this campaign lacks (nor a pantheon by name), or an alignment or domain the page's pickers do not offer", async () => {
    await useDeityAskAdapter().run(proposal({ pantheon_id: "other-campaign", pantheon: "The Hollow Court", alignment: "Chaotic Silly", domain: "Pizza" }));
    expect(mocks.generateAndCreateDeity.mock.calls[0][1]).toMatchObject({ pantheon: undefined, alignment: undefined, primaryDomain: undefined });
  });

  it("waits for the pantheons when one is named, rather than run without it", () => {
    state.pantheons = undefined;
    expect(useDeityAskAdapter().quote(proposal({ pantheon_id: "pan1" })).block?.reason).toBe("missing");
    expect(useDeityAskAdapter().quote(proposal()).block).toBeNull();
  });

  it("a failed picture leaves the deity saved and says so, with no retry Ask cannot honour", async () => {
    mocks.generateAndCreateDeity.mockResolvedValue(saved({ picture: "failed" }));
    const result = await useDeityAskAdapter().run(proposal({ image: true }));
    expect(result).toMatchObject({ record: { type: "deity", id: "d1", name: "Vesper" }, route: "/deities/d1" });
    expect(result.parts[0]).toMatchObject({ label: "Deity text", ok: true });
    expect(result.parts[1]).toMatchObject({ label: "Picture", ok: false });
    expect(result.parts[1].retry).toBeUndefined();
  });

  it("a failed secrets note is its own part and the deity stays saved", async () => {
    mocks.generateAndCreateDeity.mockResolvedValue(saved({ deity: { id: "d1", name: "Vesper", campaignId: "c1", notesFailure: new Error("rls"), linkErrors: [] } }));
    const result = await useDeityAskAdapter().run(proposal());
    expect(result.record?.id).toBe("d1");
    expect(result.parts.map((p) => [p.label, p.ok])).toEqual([["Deity text", true], ["DM notes", false]]);
  });

  it("returns a failed part instead of throwing when generation fails or the save throws", async () => {
    mocks.generateAndCreateDeity.mockResolvedValueOnce({ deity: null, error: "Provider down", picture: "none" });
    expect((await useDeityAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "Provider down" });
    mocks.generateAndCreateDeity.mockRejectedValueOnce(new Error("save failed"));
    expect((await useDeityAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "save failed" });
    mocks.generateAndCreateDeity.mockRejectedValueOnce({ message: "quota_exceeded" });
    expect((await useDeityAskAdapter().run(proposal())).parts[0].error).toContain("limit of deities");
  });

  // Bug caught: a painted deity was saved but never reached the result card, so the DM could not see it in the chat.
  it("puts a saved picture's URL on the result so the chat can show it, and leaves it unset when the picture failed", async () => {
    mocks.generateAndCreateDeity.mockResolvedValueOnce(saved({ picture: "saved", pictureUrl: "https://img/deity.webp" }));
    expect((await useDeityAskAdapter().run(proposal({ image: true }))).picture).toBe("https://img/deity.webp");
    mocks.generateAndCreateDeity.mockResolvedValueOnce(saved({ picture: "failed", pictureUrl: null }));
    expect((await useDeityAskAdapter().run(proposal({ image: true }))).picture).toBeUndefined();
  });

  describe("yes or no on ties to existing records", () => {
    const GUILD = "00000000-0000-4000-8000-0000000000d1";
    // Bug caught: unticking the pantheon on the quote still filed the deity in it.
    it("the pantheon line carries a choice keyed pantheon_id; at no the workflow gets no pantheon, unanswered it does", async () => {
      const adapter = useDeityAskAdapter();
      expect(adapter.quote(proposal({ pantheon_id: "pan1" })).lines.find((l) => l.label === "Pantheon")?.choice).toEqual({ key: "pantheon_id", on: true });
      await adapter.run(proposal({ pantheon_id: "pan1" }));
      expect(mocks.generateAndCreateDeity.mock.calls[0][1].pantheon).toMatchObject({ id: "pan1" });
      expect(adapter.quote(proposal({ pantheon_id: "pan1" }), { pantheon_id: false }).lines.find((l) => l.label === "Pantheon")?.choice?.on).toBe(false);
      await adapter.run(proposal({ pantheon_id: "pan1" }), { pantheon_id: false });
      expect(mocks.generateAndCreateDeity.mock.calls[1][1].pantheon).toBeUndefined();
    });

    // Bug caught: a tie the DM unticked was still written, because run read the unfiltered list.
    it("a tie at no never reaches the workflow's links", async () => {
      const word = typeChoices("deity", "faction")[0]!.word.replaceAll(" ", "_");
      const links = [{ kind: "faction", id: GUILD, relation: word }];
      state.linkNames = new Map([[`faction:${GUILD}`, "The Guild"]]);
      const adapter = useDeityAskAdapter();
      const key = adapter.quote(proposal({ links })).lines.find((l) => l.value === "The Guild")!.choice!.key;
      await adapter.run(proposal({ links }), { [key]: false });
      expect(mocks.generateAndCreateDeity.mock.calls[0][1].links).toEqual([]);
    });
  });
});
