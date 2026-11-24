import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({ generateAndCreateFaction: vi.fn() }));
const state = vi.hoisted(() => ({
  aiEnabled: true, canCreate: true, affordable: true,
  npcs: undefined as { id: string; name: string; occupation: string | null }[] | undefined,
  places: undefined as { id: string; name: string }[] | undefined,
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
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: { get value() { return state.npcs; } } }) }));
vi.mock("@/composables/locations/useLocations", () => ({
  useAllLocations: () => ({ data: { get value() { return state.places; } } }),
}));
vi.mock("@/ai/ask/adapters/askLinkRecords", () => ({
  useAskLinkRecords: (wanted: () => readonly unknown[]) => ({
    names: computed(() => state.linkNames),
    loading: computed(() => wanted().length > 0 && state.linkNames === undefined),
    failed: computed(() => false),
  }),
}));
vi.mock("@/composables/factions/useGenerateFaction", () => ({
  useGenerateFaction: () => ({ generateAndCreateFaction: mocks.generateAndCreateFaction }),
}));

const { useFactionAskAdapter } = await import("./factionAskAdapter");
const { useFactionQuote } = await import("@/composables/ai/quotes/factionQuote");

const proposal = (inputs: Record<string, unknown> = {}, concept = "A thieves' guild under the merchant quarter"): AskProposal => ({
  proposalId: "p1", generator: "faction", concept, inputs,
});
const saved = (over: Record<string, unknown> = {}) => ({
  id: "f1", name: "The Ravens", error: null, picture: "none", leader: "none", headquarters: "none", linkErrors: [], ...over,
});

describe("useFactionAskAdapter", () => {
  beforeEach(() => {
    mocks.generateAndCreateFaction.mockReset().mockResolvedValue(saved());
    Object.assign(state, {
      aiEnabled: true, canCreate: true, affordable: true,
      npcs: [{ id: "00000000-0000-4000-8000-000000000001", name: "Mara", occupation: "Smith" }, { id: "00000000-0000-4000-8000-000000000002", name: "Odo", occupation: null }, { id: "00000000-0000-4000-8000-000000000003", name: "Odo", occupation: null }],
      places: [{ id: "00000000-0000-4000-8000-000000000011", name: "Thornkeep" }],
      linkNames: new Map(),
    });
  });

  describe("links", () => {
    const AURIL = "00000000-0000-4000-8000-0000000000a1";
    const RIVAL = "00000000-0000-4000-8000-0000000000a2";
    const links = [
      { kind: "deity", id: AURIL, relation: "serves" },
      { kind: "faction", id: RIVAL, relation: "rival_of" },
    ];
    beforeEach(() => {
      state.linkNames = new Map([[`deity:${AURIL}`, "Auril"], [`faction:${RIVAL}`, "The Guild"]]);
    });

    it("names each tie on the quote and hands the page's own pending ties to the workflow", async () => {
      const adapter = useFactionAskAdapter();
      const quote = adapter.quote(proposal({ links }));
      expect(quote.lines.filter((l) => l.value === "Auril" || l.value === "The Guild").map((l) => [l.label, l.value])).toEqual([["Serves", "Auril"], ["Rival of", "The Guild"]]);
      await adapter.run(proposal({ links }));
      const options = mocks.generateAndCreateFaction.mock.calls[0][1];
      expect(options.links.map((l: { kind: string; id: string; name: string; choice: { key: string } }) => [l.kind, l.id, l.name, l.choice.key])).toEqual([
        ["deity", AURIL, "Auril", "serves"],
        ["faction", RIVAL, "The Guild", "rival"],
      ]);
    });

    // Bug caught: a link to a record that is not this campaign's was tied anyway.
    it("ignores a tie whose record is not in this campaign", async () => {
      state.linkNames = new Map([[`deity:${AURIL}`, "Auril"]]);
      await useFactionAskAdapter().run(proposal({ links }));
      expect(mocks.generateAndCreateFaction.mock.calls[0][1].links).toHaveLength(1);
    });

    // Bug caught: run before the records were read made the faction with no ties, silently.
    it("waits for the records the ties name, and run makes nothing meanwhile", async () => {
      state.linkNames = undefined;
      const adapter = useFactionAskAdapter();
      expect(adapter.quote(proposal({ links })).block).toMatchObject({ reason: "missing", message: "Still reading the records it is tied to." });
      await adapter.run(proposal({ links }));
      expect(mocks.generateAndCreateFaction).not.toHaveBeenCalled();
    });

    // Bug caught: a failed leader was also reported as a Connections part, or a failed tie hid behind the leader's part.
    it("shows a failed tie as its own part, apart from the leader's and headquarters'", async () => {
      mocks.generateAndCreateFaction.mockResolvedValue(saved({ leader: "failed", linkErrors: ["The leader could not be added: gone", "Auril: denied"] }));
      const result = await useFactionAskAdapter().run(proposal({ links, leader_npc_id: "00000000-0000-4000-8000-000000000001" }));
      const connections = result.parts.find((p) => p.label === "Connections");
      expect(connections).toMatchObject({ ok: false, error: "Some connections could not be added: Auril: denied" });
      expect(result.record).toMatchObject({ id: "f1" });
    });

    it("adds no Connections part when only the leader failed", async () => {
      mocks.generateAndCreateFaction.mockResolvedValue(saved({ leader: "failed", linkErrors: ["The leader could not be added: gone"] }));
      const result = await useFactionAskAdapter().run(proposal({ leader_npc_id: "00000000-0000-4000-8000-000000000001" }));
      expect(result.parts.map((p) => p.label)).not.toContain("Connections");
    });
  });

  it("quotes the same price the page shows, with the emblem counted only when asked", () => {
    const adapter = useFactionAskAdapter();
    const price = useFactionQuote();
    expect(adapter.quote(proposal()).total).toBe(price({ image: false }).total);
    expect(adapter.quote(proposal({ image: true })).total).toBe(price({ image: true }).total);
  });

  it("blocks once per gate: AI off, the plan's faction limit, a short balance, a missing description", () => {
    state.aiEnabled = false;
    expect(useFactionAskAdapter().quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.canCreate = false;
    expect(useFactionAskAdapter().quote(proposal()).block?.reason).toBe("quota");
    state.canCreate = true;
    state.affordable = false;
    expect(useFactionAskAdapter().quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
    expect(useFactionAskAdapter().quote(proposal({}, "")).block?.reason).toBe("missing");
  });

  it("waits for the NPCs and places before it quotes a leader named by id", () => {
    state.npcs = undefined;
    expect(useFactionAskAdapter().quote(proposal({ leader_npc_id: "00000000-0000-4000-8000-000000000001" })).block).toMatchObject({ reason: "missing" });
  });

  it("links the leader and the headquarters it is given by id, worded as the page words them", async () => {
    await useFactionAskAdapter().run(proposal({ leader_npc_id: "00000000-0000-4000-8000-000000000001", headquarters_id: "00000000-0000-4000-8000-000000000011", faction_type: "guild", alignment: "chaotic neutral" }));
    expect(mocks.generateAndCreateFaction.mock.calls[0][1]).toEqual({
      faction_type: "Guild", alignment: "Chaotic Neutral",
      leader_name: "Mara (Smith)", headquarters_name: "Thornkeep",
      leaderNpcId: "00000000-0000-4000-8000-000000000001", headquartersLocationId: "00000000-0000-4000-8000-000000000011", generateImage: false, links: [],
    });
  });

  it("never links a name, or an id this campaign lacks, and still tells the generator the name as a constraint", async () => {
    await useFactionAskAdapter().run(proposal({ leader_name: "Odo", headquarters_name: "Nowhere Hall", headquarters_id: "00000000-0000-4000-8000-000000000099", system_prompt: "x" }));
    expect(mocks.generateAndCreateFaction.mock.calls[0][1]).toEqual({
      faction_type: undefined, alignment: undefined,
      leader_name: "Odo", headquarters_name: "Nowhere Hall",
      leaderNpcId: null, headquartersLocationId: null, generateImage: false, links: [],
    });
  });

  // Bug caught: with a pick and a typed name both on the card, the typed name overwrote the picked NPC and linked nobody.
  it("lets a picked record win over a name typed beside it, which stays only a name when nothing is picked", async () => {
    const MARA = "00000000-0000-4000-8000-000000000001";
    await useFactionAskAdapter().run(proposal({ leader_npc_id: MARA, leader_name: "Someone else" }));
    expect(mocks.generateAndCreateFaction.mock.calls[0][1]).toMatchObject({ leaderNpcId: MARA, leader_name: "Mara (Smith)" });
    await useFactionAskAdapter().run(proposal({ leader_name: "Someone else" }));
    expect(mocks.generateAndCreateFaction.mock.calls[1][1]).toMatchObject({ leaderNpcId: null, leader_name: "Someone else" });
  });

  it("names the linked leader and headquarters in the quote, and a bare name as named only", () => {
    const linked = useFactionAskAdapter().quote(proposal({ leader_npc_id: "00000000-0000-4000-8000-000000000001", headquarters_id: "00000000-0000-4000-8000-000000000011" })).lines;
    expect(linked.find((l) => l.label === "Leader")?.value).toBe("Mara, from your NPCs");
    expect(linked.find((l) => l.label === "Headquarters")?.value).toBe("Thornkeep, from your Atlas");
    const named = useFactionAskAdapter().quote(proposal({ leader_name: "Odo" })).lines;
    expect(named.find((l) => l.label === "Leader")?.value).toBe("Odo, named only");
  });

  it("a blocked run spends nothing: the workflow is never called", async () => {
    state.canCreate = false;
    await useFactionAskAdapter().run(proposal());
    expect(mocks.generateAndCreateFaction).not.toHaveBeenCalled();
  });

  it("a leader that failed to link is its own failed part and the faction stays saved", async () => {
    mocks.generateAndCreateFaction.mockResolvedValue(saved({
      leader: "failed", headquarters: "saved", linkErrors: ["The leader could not be added: npc gone"],
    }));
    const result = await useFactionAskAdapter().run(proposal({ leader_npc_id: "00000000-0000-4000-8000-000000000001", headquarters_id: "00000000-0000-4000-8000-000000000011" }));
    expect(result).toMatchObject({ record: { type: "faction", id: "f1", name: "The Ravens" }, route: "/factions/f1" });
    expect(result.parts.map((p) => [p.label, p.ok])).toEqual([["Faction", true], ["Leader", false], ["Headquarters", true]]);
    expect(result.parts[1].error).toContain("npc gone");
  });

  it("a failed emblem leaves the faction saved, and offers no retry because no paint flow exists for emblems", async () => {
    mocks.generateAndCreateFaction.mockResolvedValue(saved({ picture: "failed" }));
    const result = await useFactionAskAdapter().run(proposal({ image: true }));
    expect(result.parts[1]).toMatchObject({ label: "Emblem", ok: false });
    expect(result.parts[1].retry).toBeUndefined();
  });

  it("returns a failed part instead of throwing when generation fails or the save throws, and names a quota race", async () => {
    mocks.generateAndCreateFaction.mockResolvedValueOnce({ ...saved(), id: null, name: null, error: "Provider down" });
    expect((await useFactionAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "Provider down" });
    mocks.generateAndCreateFaction.mockRejectedValueOnce(new Error("save failed"));
    expect((await useFactionAskAdapter().run(proposal())).parts[0]).toMatchObject({ ok: false, error: "save failed" });
    mocks.generateAndCreateFaction.mockRejectedValueOnce({ message: "quota_exceeded" });
    expect((await useFactionAskAdapter().run(proposal())).parts[0].error).toContain("limit of factions");
  });

  // Bug caught: a painted faction was saved but never reached the result card, so the DM could not see it in the chat.
  it("puts a saved picture's URL on the result so the chat can show it, and leaves it unset when the picture failed", async () => {
    mocks.generateAndCreateFaction.mockResolvedValueOnce(saved({ picture: "saved", pictureUrl: "https://img/faction.webp" }));
    expect((await useFactionAskAdapter().run(proposal({ image: true }))).picture).toBe("https://img/faction.webp");
    mocks.generateAndCreateFaction.mockResolvedValueOnce(saved({ picture: "failed", pictureUrl: null }));
    expect((await useFactionAskAdapter().run(proposal({ image: true }))).picture).toBeUndefined();
  });

  describe("yes or no on ties to existing records", () => {
    // Bug caught: unticking the leader or headquarters on the quote still seated or based them.
    it("lines carry their field as the key; at no the workflow gets null ids for that field only, the typed name stays", async () => {
      const adapter = useFactionAskAdapter();
      const inputs = { leader_npc_id: "00000000-0000-4000-8000-000000000001", headquarters_id: "00000000-0000-4000-8000-000000000011" };
      const lines = adapter.quote(proposal(inputs)).lines;
      expect(lines.find((l) => l.label === "Leader")?.choice).toEqual({ key: "leader_npc_id", on: true });
      expect(lines.find((l) => l.label === "Headquarters")?.choice).toEqual({ key: "headquarters_id", on: true });
      await adapter.run(proposal(inputs));
      expect(mocks.generateAndCreateFaction.mock.calls[0][1]).toMatchObject({ leaderNpcId: "00000000-0000-4000-8000-000000000001", headquartersLocationId: "00000000-0000-4000-8000-000000000011" });
      await adapter.run(proposal({ ...inputs, leader_name: "Mara the Red" }), { leader_npc_id: false });
      expect(mocks.generateAndCreateFaction.mock.calls[1][1]).toMatchObject({ leaderNpcId: null, leader_name: "Mara the Red", headquartersLocationId: "00000000-0000-4000-8000-000000000011" });
      await adapter.run(proposal(inputs), { headquarters_id: false });
      expect(mocks.generateAndCreateFaction.mock.calls[2][1]).toMatchObject({ leaderNpcId: "00000000-0000-4000-8000-000000000001", headquartersLocationId: null });
    });

    // Bug caught: a leader named only as text got a checkbox, though it ties to no record.
    it("a leader or headquarters named only as text has no choice", () => {
      const lines = useFactionAskAdapter().quote(proposal({ leader_name: "Odo", headquarters_name: "Nowhere Hall" })).lines;
      expect(lines.filter((l) => l.label === "Leader" || l.label === "Headquarters").map((l) => l.choice)).toEqual([undefined, undefined]);
    });

    // Bug caught: a tie the DM unticked was still written, because run read the unfiltered list.
    it("a tie at no never reaches the workflow's links", async () => {
      const AURIL = "00000000-0000-4000-8000-0000000000a1";
      state.linkNames = new Map([[`deity:${AURIL}`, "Auril"]]);
      const links = [{ kind: "deity", id: AURIL, relation: "serves" }];
      const adapter = useFactionAskAdapter();
      const key = adapter.quote(proposal({ links })).lines.find((l) => l.value === "Auril")!.choice!.key;
      await adapter.run(proposal({ links }), { [key]: false });
      expect(mocks.generateAndCreateFaction.mock.calls[0][1].links).toEqual([]);
    });
  });
});
