import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({ generate: vi.fn(), clearCompleted: vi.fn(), create: vi.fn() }));
const state = vi.hoisted(() => ({
  aiEnabled: true, canCreate: true, affordable: true, error: "" as string,
  party: undefined as { level: number }[] | undefined,
  npcs: undefined as { id: string; name: string; occupation: string | null; relationship: string | null }[] | undefined,
  places: undefined as { id: string; name: string }[] | undefined,
  factions: undefined as { id: string; name: string }[] | undefined,
}));
const generating = vi.hoisted(() => ({ value: false }));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ get isAiEnabled() { return state.aiEnabled; }, activeCampaign: { name: "Sugarwell" } }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({
  useAiCredits: () => ({ costOf: () => 2, affordable: () => state.affordable }),
}));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({ imageProvider: ref("openai"), textCredits: (b: number) => b, imageCredits: (b: number) => b }),
}));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: { get value() { return state.canCreate; } } }) }));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => true }) }));
vi.mock("@/composables/party/useActiveParty", () => ({ useActiveParty: () => ({ data: { get value() { return state.party; } } }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: { get value() { return state.npcs; } } }) }));
vi.mock("@/composables/factions/useFactions", () => ({ useAllFactions: () => ({ data: { get value() { return state.factions; } } }) }));
vi.mock("@/composables/quests/useCreateQuestFromHook", () => ({ useCreateQuestFromHook: () => ({ createFromHook: mocks.create }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => ({ data: { get value() { return state.places; } } }) }));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: { get value() { return generating.value; } } }));
vi.mock("@/ai/useQuestGeneration", () => ({
  useQuestGeneration: () => ({
    generate: mocks.generate, clearCompleted: mocks.clearCompleted, concept: ref(""), completedEntityId: ref(null), provenance: ref({ edited: false }),
    error: { get value() { return state.error; } },
  }),
}));

const { useQuestHooksAskAdapter } = await import("./questHooksAskAdapter");
const { useQuestHooksQuote } = await import("@/composables/ai/quotes/questHooksQuote");

const proposal = (inputs: Record<string, unknown> = {}, concept = "A cult under the mill"): AskProposal => ({
  proposalId: "p1", generator: "quest_hooks", concept, inputs,
});
/** A record input is a uuid: a name or a made-up id never reaches a lookup. */
const NPC = "11111111-1111-4111-8111-111111111111";
const PLACE = "22222222-2222-4222-8222-222222222222";
const hooks = (n: number) => Array.from({ length: n }, (_, i) => ({
  title: `Hook ${i}`, summary: `Summary ${i}`, tags: [],
  objectives: [{ description: `Find out ${i}` }],
  beats: [{ key: "a", title: "The hook", kind: "neutral" }, { key: "b", title: "The turn", kind: "neutral" }],
  routes: [{ from: "a", to: "b" }],
}));

async function previewed(p: AskProposal) {
  const outcome = await useQuestHooksAskAdapter().preview(p);
  if (!outcome.ok) throw new Error("expected a preview");
  return outcome.preview;
}

describe("useQuestHooksAskAdapter", () => {
  beforeEach(() => {
    mocks.generate.mockReset().mockResolvedValue(hooks(5));
    mocks.clearCompleted.mockReset();
    mocks.create.mockReset().mockResolvedValue({ questId: "q1", beatsCreated: 2 });
    Object.assign(state, {
      aiEnabled: true, canCreate: true, affordable: true, error: "",
      party: [{ level: 3 }, { level: 4 }],
      npcs: [{ id: NPC, name: "Mara", occupation: "Smith", relationship: "ally" }],
      places: [{ id: PLACE, name: "Thornkeep" }],
      factions: [{ id: "f1", name: "The Hand" }],
    });
    generating.value = false;
  });

  // Bug caught: Ask and the Quest Generator panel quoted different prices for the same five hooks.
  it("quotes the price the hooks cost", () => {
    expect(useQuestHooksAskAdapter().quote(proposal()).total).toBe(useQuestHooksQuote()().total);
  });

  it("blocks on AI off, quota and a short balance, and generates nothing", async () => {
    const adapter = useQuestHooksAskAdapter();
    state.aiEnabled = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("system");
    state.aiEnabled = true;
    state.canCreate = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("quota");
    state.canCreate = true;
    state.affordable = false;
    expect(adapter.quote(proposal()).block?.reason).toBe("credits");
    expect((await adapter.preview(proposal())).ok).toBe(false);
    expect(mocks.generate).not.toHaveBeenCalled();
  });

  // Bug caught: the theme was required, but the panel's was optional, so a DM who only picked a giver could not ask.
  it("lets the theme be empty, blocks one past its limit, and waits for the lists still loading", () => {
    const adapter = useQuestHooksAskAdapter();
    expect(adapter.quote(proposal({}, "   ")).block).toBeNull();
    expect(adapter.quote(proposal({}, "x".repeat(501))).block?.reason).toBe("missing");
    state.npcs = undefined;
    expect(adapter.quote(proposal({ quest_giver_id: NPC })).block?.message).toMatch(/Still reading/);
  });

  // Bug caught: an id the model made up reached the request as a giver, or a stray input key was passed on.
  it("understands only a giver and place this campaign has, and sends the panel's own request", async () => {
    await previewed(proposal({ quest_giver_id: NPC, location_id: "33333333-3333-4333-8333-333333333333", system_prompt: "x" }));
    const prompt = mocks.generate.mock.calls[0]![0] as string;
    expect(prompt).toContain("Party level: 4");
    expect(prompt).toContain("Quest Giver: Mara (Smith, ally)");
    expect(prompt).not.toContain("Location");
    expect(prompt).not.toContain("system_prompt");
    expect(prompt).toContain("Theme: A cult under the mill");
  });

  it("sends no theme line when none was given", async () => {
    await previewed(proposal({}, ""));
    expect(mocks.generate.mock.calls[0]![0] as string).not.toContain("Theme");
  });

  /** The row action of hook `i`: each hook is its own section, with the press on its first row. */
  const rowOf = (preview: Awaited<ReturnType<typeof previewed>>, i: number) => {
    const action = preview.shown.sections[i].rows[0].action;
    if (!action) throw new Error("expected a row action");
    return action;
  };

  // Bug caught: the hooks were built at the generation, so the DM could not read them before choosing one.
  it("builds nothing until a row is pressed, and charges the generation's price once", async () => {
    const preview = await previewed(proposal());
    expect(mocks.create).not.toHaveBeenCalled();
    expect(preview.parts).toEqual([{ label: "Quest hooks", ok: true, credits: 2 }]);
    expect(preview.shown.sections.map((sec) => sec.rows[0].action?.label)).toEqual(Array(5).fill("Create quest"));
  });

  // Bug caught: only one of the five hooks could be made (a single pick), so the other four were lost after Create.
  it("builds each hook on its own press, with the giver and place and the campaign's people, and links to it", async () => {
    mocks.create.mockResolvedValueOnce({ questId: "q3", beatsCreated: 2 }).mockResolvedValueOnce({ questId: "q1", beatsCreated: 2 });
    const preview = await previewed(proposal({ quest_giver_id: NPC, location_id: PLACE }));
    const third = await rowOf(preview, 3).run();
    expect(third).toMatchObject({ ok: true, credits: 0, links: [{ label: "View quest", route: "/quests/q3" }] });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      hook: expect.objectContaining({ title: "Hook 3" }),
      giverNpcId: NPC,
      locationId: PLACE,
      entityPools: { npcs: [{ id: NPC, name: "Mara" }], locations: [{ id: PLACE, name: "Thornkeep" }], factions: [{ id: "f1", name: "The Hand" }] },
      aiProvenance: { edited: false },
    }));
    await rowOf(preview, 0).run();
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });

  // Bug caught: a second press on a built hook made a second quest.
  it("builds a hook once: a second press, even a simultaneous one, makes no second quest", async () => {
    const preview = await previewed(proposal());
    const action = rowOf(preview, 1);
    const [first, second] = await Promise.all([action.run(), action.run()]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    const again = await action.run();
    expect(again).toMatchObject({ ok: true, links: [{ label: "View quest", route: "/quests/q1" }] });
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });

  it("shows each hook with its own Create quest, player log, objectives, story beats and route", async () => {
    const { shown } = await previewed(proposal());
    expect(shown.title).toBe("5 quest hooks");
    expect(shown.sections).toHaveLength(5);
    expect(shown.sections[0]).toMatchObject({ heading: "Hook 0", hint: "Summary 0" });
    expect(shown.sections[0].rows.map((r) => r.label)).toEqual(["Quest", "Objective", "1. The hook", "2. The turn", "Route"]);
  });

  // Bug caught: a quest built with no story beats said nothing, so the DM learned it by opening the story flow.
  it("notes on the row that the built quest has no story beats", async () => {
    mocks.create.mockResolvedValue({ questId: "q1", beatsCreated: 0 });
    const made = await rowOf(await previewed(proposal()), 0).run();
    expect(made).toMatchObject({ ok: true, error: expect.stringMatching(/no story beats/) });
  });

  // Bug caught: a row pressed before the lists arrived built a quest without its people and places, or a failed save left the row stuck.
  it("fails a row, and leaves it pressable, when the lists have not arrived or the save fails", async () => {
    const action = rowOf(await previewed(proposal()), 0);
    state.factions = undefined;
    expect(await action.run()).toMatchObject({ ok: false, error: expect.stringMatching(/Still reading/) });
    expect(mocks.create).not.toHaveBeenCalled();
    state.factions = [];
    mocks.create.mockRejectedValueOnce(new Error("insert failed"));
    expect(await action.run()).toMatchObject({ ok: false, error: "insert failed" });
    expect(await action.run()).toMatchObject({ ok: true });
  });

  // Bug caught: Done with nothing built reported a saved result for a record that does not exist.
  it("Done keeps nothing when no hook was built, and names the quests that were", async () => {
    const preview = await previewed(proposal());
    expect(await preview.create()).toMatchObject({ record: null });
    mocks.create.mockResolvedValueOnce({ questId: "qa", beatsCreated: 2 }).mockResolvedValueOnce({ questId: "qb", beatsCreated: 2 });
    await rowOf(preview, 0).run();
    expect(await preview.create()).toMatchObject({ record: { type: "quest", id: "qa", name: "Hook 0" }, route: "/quests/qa" });
    await rowOf(preview, 1).run();
    const several = await preview.create();
    expect(several.route).toBeNull();
    expect(several.links).toEqual([{ label: "View Hook 0", route: "/quests/qa" }, { label: "View Hook 1", route: "/quests/qb" }]);
  });

  it("returns a failed part instead of throwing when generation fails or throws", async () => {
    mocks.generate.mockResolvedValueOnce(null);
    state.error = "Provider down";
    const failed = await useQuestHooksAskAdapter().preview(proposal());
    expect(failed.ok === false && failed.result.parts[0]).toMatchObject({ ok: false, error: "Provider down" });
    mocks.generate.mockRejectedValueOnce(new Error("boom"));
    const thrown = await useQuestHooksAskAdapter().preview(proposal());
    expect(thrown.ok === false && thrown.result.parts[0]).toMatchObject({ ok: false, error: "boom" });
  });

  // Bug caught: a second generation started while another one was running (they share one generating state).
  it("does not start while another generation is running", async () => {
    generating.value = true;
    const outcome = await useQuestHooksAskAdapter().preview(proposal());
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(false);
  });
});
