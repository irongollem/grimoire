import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({ draft: vi.fn(), save: vi.fn() }));
const habitatState = vi.hoisted(() => ({ value: null as { name: string; life: { id: string; habitatId: string; recordId: string; fromLibrary: boolean; name: string; readable: boolean; percent: number }[] } | null }));
const state = vi.hoisted(() => ({ aiEnabled: true, canCreate: true, affordable: true, offersStatBlocks: true, whereReady: true, places: undefined as { id: string; name: string }[] | undefined }));

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
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => state.offersStatBlocks }) }));
vi.mock("@/composables/locations/useLocations", () => ({
  useAllLocations: () => ({ data: { get value() { return state.places; } } }),
}));
vi.mock("@/composables/encounters/useGenerateEncounter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/composables/encounters/useGenerateEncounter")>()),
  useGenerateEncounter: () => ({ generateEncounterDraft: mocks.draft, saveEncounterDraft: mocks.save }),
}));
vi.mock("@/composables/library/useSourceTitles", () => ({ useSourceTitles: () => ({ labelFor: (s: string | null) => s ?? "" }) }));
vi.mock("@/composables/encounters/useEncounterWhere", () => ({
  // The habitat answers only once the place's reads have: before that it is null, as the real lists are empty.
  useEncounterWhere: () => ({
    habitatFor: () => (state.whereReady ? habitatState.value : null),
    ready: { get value() { return state.whereReady; } },
  }),
}));

const { useEncounterAskAdapter } = await import("./encounterAskAdapter");
const { useEncounterQuote } = await import("@/composables/ai/quotes/encounterQuote");

/** A record input is a uuid: a name or a made-up id never reaches a lookup. */
const PLACE = "11111111-1111-4111-8111-111111111111";
const ELSEWHERE = "22222222-2222-4222-8222-222222222222";
const proposal = (inputs: Record<string, unknown> = {}, concept = "Goblins on the forest road"): AskProposal => ({
  proposalId: "p1", generator: "encounter", concept, inputs,
});
const draft = (over: Record<string, unknown> = {}) => ({
  result: { name: "Road Ambush", difficulty: "hard", environment: "A forest road", tactics: "", twist: "A bridge", combatants: [] },
  matched: [{ def: { count: 4, custom_name: null }, entryIndex: 0, candidates: [], monster: { name: "Goblin", challenge_rating: "1/4" } }],
  unmatched: [],
  ...over,
});
const drafted = (over: Record<string, unknown> = {}) => ({ draft: draft(over), error: null });

async function previewed(adapter: ReturnType<typeof useEncounterAskAdapter>, p: AskProposal, choices?: Record<string, boolean>) {
  const outcome = await adapter.preview(p, choices);
  if (!outcome.ok) throw new Error("expected a preview");
  return outcome.preview;
}

describe("useEncounterAskAdapter", () => {
  beforeEach(() => {
    mocks.draft.mockReset().mockResolvedValue(drafted());
    mocks.save.mockReset().mockResolvedValue({ id: "r1", name: "Road Ambush" });
    habitatState.value = null;
    Object.assign(state, { aiEnabled: true, canCreate: true, affordable: true, offersStatBlocks: true, whereReady: true, places: [{ id: PLACE, name: "Whispering Caves" }] });
  });

  it("quotes the same price the page shows", () => {
    expect(useEncounterAskAdapter().quote(proposal()).total).toBe(useEncounterQuote()().total);
  });

  it("blocks with AI off, on a short balance, and on an empty or overlong concept, and generates nothing", async () => {
    const adapter = useEncounterAskAdapter();
    state.aiEnabled = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.affordable = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("credits");
    state.affordable = true;
    expect(adapter.quote(proposal({}, "   ")).block?.reason).toBe("missing");
    expect(adapter.quote(proposal({}, "x".repeat(501))).block?.reason).toBe("missing");
    const outcome = await adapter.preview(proposal({}, "   "));
    expect(mocks.draft).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(false);
  });

  it("blocks on a campaign whose game system has no stat blocks", async () => {
    state.offersStatBlocks = false;
    const adapter = useEncounterAskAdapter();
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    await adapter.preview(proposal());
    expect(mocks.draft).not.toHaveBeenCalled();
  });

  it("blocks on the encounters quota", () => {
    state.canCreate = false;
    expect(useEncounterAskAdapter().quote(proposal()).block?.reason).toBe("quota");
  });

  // Bug caught: the encounter saved at the generation, so the DM never saw it before it was kept.
  it("generates and saves nothing until create is called", async () => {
    const preview = await previewed(useEncounterAskAdapter(), proposal());
    expect(mocks.draft).toHaveBeenCalledTimes(1);
    expect(mocks.save).not.toHaveBeenCalled();
    await preview.create();
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  // Bug caught: the generation's credits missing from the parts, so the folded line and the notice said nothing was spent.
  it("reports the generation's price as its part, and create adds no charge", async () => {
    const preview = await previewed(useEncounterAskAdapter(), proposal());
    expect(preview.parts).toHaveLength(1);
    expect(preview.parts[0]).toMatchObject({ label: "Encounter", ok: true, credits: 1 });
    const made = await preview.create();
    expect(made.parts.reduce((sum, p) => sum + p.credits, 0)).toBe(1);
  });

  it("shows the line-up with each creature's CR, the model's notes and the difficulty for the party", async () => {
    const { shown } = await previewed(useEncounterAskAdapter(), proposal());
    expect(shown.title).toBe("Road Ambush");
    expect(shown.badge).toBe("Hard for the party");
    expect(shown.sections[0]).toEqual({ heading: "Combatants", rows: [{ label: "4 × Goblin", detail: "CR 1/4" }] });
    // Empty notes are not rows.
    expect(shown.sections[1].rows.map((r) => r.label)).toEqual(["Environment", "Twist"]);
  });

  it("names creatures the Bestiary lacks in a note, and again in the result's own part", async () => {
    mocks.draft.mockResolvedValue(drafted({ unmatched: [{ name: "Dragon", count: 2, role: "Boss" }, { name: "Imp", count: 1, role: "" }] }));
    const preview = await previewed(useEncounterAskAdapter(), proposal());
    expect(preview.shown.note).toBe("Not in your Bestiary, to add by hand: 2 × Dragon (Boss), 1 × Imp");
    const made = await preview.create();
    expect(made.parts[1]).toMatchObject({ label: "Creatures", ok: false });
    expect(made.parts[1].error).toContain("2 creatures are not in your Bestiary");
  });

  it("opens the editor, like the page", async () => {
    const made = await (await previewed(useEncounterAskAdapter(), proposal())).create();
    expect(made).toMatchObject({ record: { type: "encounter", id: "r1", name: "Road Ambush" }, route: "/encounters/r1?edit=true" });
    expect(made.parts).toHaveLength(1);
  });

  it("ends with a failed part, and no preview, when the generator gave nothing", async () => {
    mocks.draft.mockResolvedValue({ draft: null, error: "Provider down" });
    const outcome = await useEncounterAskAdapter().preview(proposal());
    expect(outcome).toMatchObject({ ok: false, result: { record: null, parts: [{ ok: false, error: "Provider down" }] } });
  });

  // Bug caught: a save that lost the quota race threw instead of leaving the preview to retry.
  it("a save that fails says why and records nothing, instead of throwing", async () => {
    const preview = await previewed(useEncounterAskAdapter(), proposal());
    mocks.save.mockRejectedValueOnce(new Error("quota_exceeded"));
    expect((await preview.create()).parts[0]).toMatchObject({ ok: false, error: expect.stringContaining("limit of encounters") });
    mocks.save.mockRejectedValueOnce(new Error("save failed"));
    expect(await preview.create()).toMatchObject({ record: null, parts: [{ ok: false, error: "save failed" }] });
  });

  it("passes only understood constraints, and the page's default when one is not understood", async () => {
    await useEncounterAskAdapter().preview(proposal({ difficulty: "Deadly", party_level: 9 }));
    expect(mocks.draft.mock.calls[0]).toEqual(["Goblins on the forest road", { difficulty: "deadly" }]);
    await useEncounterAskAdapter().preview(proposal());
    expect(mocks.draft.mock.calls[1][1]).toEqual({ difficulty: "auto" });
  });

  // Bug caught: the habitats, placed tables and place tree load after the Atlas, so the first generation went out with
  // no habitat constraints (a marsh rolled a desert) while the quote already read ready.
  it("blocks until the place's habitat reads have arrived, then sends what lives there", async () => {
    habitatState.value = { name: "Salt marsh", life: [{ id: "l", habitatId: "h", recordId: "eel", fromLibrary: true, name: "Marsh eel", readable: true, percent: 100 }] };
    state.whereReady = false;
    const adapter = useEncounterAskAdapter();
    expect(adapter.quote(proposal({ location_id: PLACE })).block).toMatchObject({ reason: "missing", message: "Still reading the place…" });
    expect((await adapter.preview(proposal({ location_id: PLACE }))).ok).toBe(false);
    expect(mocks.draft).not.toHaveBeenCalled();
    state.whereReady = true;
    expect(adapter.quote(proposal({ location_id: PLACE })).block).toBeNull();
    await adapter.preview(proposal({ location_id: PLACE }));
    expect(mocks.draft.mock.calls[0][1].constraints).toBeDefined();
  });

  // Bug caught: a card with no place, or with the place switched off, waiting on reads it will not use.
  it("does not wait for the place's reads when no place is used", () => {
    state.whereReady = false;
    const adapter = useEncounterAskAdapter();
    expect(adapter.quote(proposal()).block).toBeNull();
    expect(adapter.quote(proposal({ location_id: PLACE }), { location_id: false }).block).toBeNull();
  });

  // Bug caught: the place's habitat never reached the generator, so a card set in a marsh rolled a desert.
  it("tells the generator what lives where the encounter is set", async () => {
    habitatState.value = { name: "Salt marsh", life: [{ id: "l", habitatId: "h", recordId: "eel", fromLibrary: true, name: "Marsh eel", readable: true, percent: 100 }] };
    await useEncounterAskAdapter().preview(proposal({ location_id: PLACE }));
    expect(mocks.draft.mock.calls[0][1].constraints).toEqual([expect.stringContaining("Marsh eel")]);
    expect(mocks.draft.mock.calls[0][1].constraints[0]).toContain("Salt marsh");
  });

  it("names the place in the quote, and ignores a place the campaign lacks", async () => {
    const adapter = useEncounterAskAdapter();
    expect(adapter.quote(proposal({ location_id: PLACE })).lines.find((l) => l.label === "In")?.value).toBe("Whispering Caves");
    expect(adapter.quote(proposal({ location_id: ELSEWHERE })).lines.find((l) => l.label === "In")).toBeUndefined();
  });

  it("sets the encounter in the place named", async () => {
    await (await previewed(useEncounterAskAdapter(), proposal({ location_id: PLACE }))).create();
    expect(mocks.save.mock.calls[0][1]).toBe(PLACE);
    await (await previewed(useEncounterAskAdapter(), proposal({ location_id: ELSEWHERE }))).create();
    expect(mocks.save.mock.calls[1][1]).toBeNull();
  });

  it("waits for the Atlas when a place is named instead of saving the encounter nowhere", () => {
    state.places = undefined;
    expect(useEncounterAskAdapter().quote(proposal({ location_id: PLACE })).block?.reason).toBe("missing");
  });

  // Bug caught: unticking the place on the quote still anchored the encounter there.
  it("the place line carries a choice keyed location_id; at no the encounter is unanchored and its habitat unused", async () => {
    habitatState.value = { name: "Salt marsh", life: [{ id: "l", habitatId: "h", recordId: "eel", fromLibrary: true, name: "Marsh eel", readable: true, percent: 100 }] };
    const adapter = useEncounterAskAdapter();
    expect(adapter.quote(proposal({ location_id: PLACE })).lines.find((l) => l.label === "In")?.choice).toEqual({ key: "location_id", on: true });
    await (await previewed(adapter, proposal({ location_id: PLACE }))).create();
    expect(mocks.save.mock.calls[0][1]).toBe(PLACE);
    expect(adapter.quote(proposal({ location_id: PLACE }), { location_id: false }).lines.find((l) => l.label === "In")?.choice?.on).toBe(false);
    await (await previewed(adapter, proposal({ location_id: PLACE }), { location_id: false })).create();
    expect(mocks.save.mock.calls[1][1]).toBeNull();
  });

  const gob = (id: string, source: string | null, cr: string) => ({ id, name: "Goblin", is_shared: source !== null, challenge_rating: cr, source, source_title: null });
  const twoBooks = () => drafted({
    matched: [{
      def: { id: "d1", count: 4, custom_name: null }, entryIndex: 0, role: "",
      monster: gob("core", "srd", "1/4"),
      candidates: [gob("core", "srd", "1/4"), gob("kobold", "kp", "1/2")],
    }],
  });

  // Bug caught (#601): the version picker lost with the panel, so a creature in several books always used the default.
  it("offers each version of a creature that exists in several books, and says the shown one is used", async () => {
    mocks.draft.mockResolvedValue(twoBooks());
    const { shown } = await previewed(useEncounterAskAdapter(), proposal());
    expect(shown.sections[0].hint).toContain("more than one of your sourcebooks");
    expect(shown.sections[0].rows[0].choice).toEqual({
      key: "0", label: "Version", value: "core",
      options: [{ id: "core", name: "srd · CR 1/4" }, { id: "kobold", name: "kp · CR 1/2" }],
    });
  });

  // Bug caught: a picked version ignored on Create, so the encounter was saved with the default creature.
  it("saves the version the DM picked, and the default again once the pick is cleared", async () => {
    mocks.draft.mockResolvedValue(twoBooks());
    const preview = await previewed(useEncounterAskAdapter(), proposal());
    const after = preview.choose?.("0", "kobold");
    expect(after?.sections[0].rows[0]).toMatchObject({ detail: "CR 1/2", choice: { value: "kobold" } });
    await preview.create();
    expect(mocks.save.mock.calls[0][0].matched[0].monster.id).toBe("kobold");
    preview.choose?.("0", "");
    await preview.create();
    expect(mocks.save.mock.calls[1][0].matched[0].monster.id).toBe("core");
  });
});
