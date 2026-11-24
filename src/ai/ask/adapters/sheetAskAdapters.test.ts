import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";

const mocks = vi.hoisted(() => ({
  npc: vi.fn(), monster: vi.fn(), spell: vi.fn(), event: vi.fn(), create: vi.fn(),
  error: { value: null as string | null },
}));
const state = vi.hoisted(() => ({ aiEnabled: true, affordable: true, busy: false }));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ get isAiEnabled() { return state.aiEnabled; }, activeCampaign: { name: "Sugarwell" } }),
}));
vi.mock("@/composables/ai/useAiCredits", () => ({ useAiCredits: () => ({ costOf: () => 1, affordable: () => state.affordable }) }));
vi.mock("@/composables/ai/useCampaignProviders", () => ({
  useCampaignProviders: () => ({ imageProvider: ref("openai"), textCredits: (b: number) => b, imageCredits: (b: number) => b * 10 }),
}));
vi.mock("@/composables/rules/useGameSystem", () => ({ useGameSystem: () => ({ offers: () => true }) }));
vi.mock("@/ai/aiGeneratorRegistry", () => ({ isAnyAiGenerating: { get value() { return state.busy; } } }));
vi.mock("@/ai/useNpcGeneration", () => ({ useNpcGeneration: () => ({ generate: mocks.npc, error: mocks.error }) }));
vi.mock("@/ai/useMonsterGeneration", () => ({ useMonsterGeneration: () => ({ generate: mocks.monster, error: mocks.error }) }));
vi.mock("@/ai/useSpellGeneration", () => ({ useSpellGeneration: () => ({ generate: mocks.spell, error: mocks.error }) }));
vi.mock("@/ai/useCalendarEventGeneration", () => ({ useCalendarEventGeneration: () => ({ generate: mocks.event, error: mocks.error }) }));
vi.mock("@/composables/deities/useDeities", () => ({ useAllDeities: () => ({ data: ref([]) }), useAllPantheons: () => ({ data: ref([]) }) }));
vi.mock("@/composables/factions/useFactions", () => ({ useAllFactions: () => ({ data: ref([]) }) }));
// A record being saved would be the bug: any of these creating one fails the test that names it.
vi.mock("@/composables/npcs/useGenerateNpc", () => ({ useGenerateNpc: () => ({ generateAndCreateNpc: mocks.create }) }));

const { useAskFormFillStore } = await import("@/stores/ui/askFormFill");
const { useNpcSheetAskAdapter } = await import("./npcSheetAskAdapter");
const { useMonsterSheetAskAdapter } = await import("./monsterSheetAskAdapter");
const { useSpellSheetAskAdapter } = await import("./spellSheetAskAdapter");
const { useEventDescriptionAskAdapter } = await import("./eventDescriptionAskAdapter");

// The card is bound to the form instance that opened it: `opened` holds the token of the form each generator's button was
// pressed in, which is what a page's `useAskFormFill().bind` puts in `target.id`.
const opened: Record<string, string> = {};
const proposal = (generator: string, inputs: Record<string, unknown> = {}, concept = "A baker who lies"): AskProposal => ({
  proposalId: "p1", generator, concept, inputs,
  ...(opened[generator] ? { target: { type: "npc" as const, id: opened[generator], name: "The form" } } : {}),
});

function openForm(id: string, context: unknown = undefined) {
  const apply = vi.fn();
  opened[id] = useAskFormFillStore().register(id, { context: () => context, apply });
  return apply;
}

describe("the sheet adapters", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    for (const key of Object.keys(opened)) delete opened[key];
    Object.values(mocks).forEach((m) => "mockReset" in m && m.mockReset());
    mocks.error.value = null;
    Object.assign(state, { aiEnabled: true, affordable: true, busy: false });
  });

  // Bug caught: Generate on the editor made a record and navigated away, as the dialog never did.
  it("fills the open NPC form with the generated person and creates no record", async () => {
    const apply = openForm("npc_sheet");
    mocks.npc.mockResolvedValue({ name: "Mira" });
    const ended = await useNpcSheetAskAdapter().run(proposal("npc_sheet", { portrait: true }));
    expect(apply).toHaveBeenCalledExactlyOnceWith({ name: "Mira" });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(ended.route).toBeNull();
  });

  // Bug caught: the card ran with no editor open and charged for a person with nowhere to go.
  it("spends nothing while the form is closed", async () => {
    const adapter = useNpcSheetAskAdapter();
    expect(adapter.quote(proposal("npc_sheet")).block?.reason).toBe("missing");
    const ended = await adapter.run(proposal("npc_sheet"));
    expect(mocks.npc).not.toHaveBeenCalled();
    expect(ended.parts[0].ok).toBe(false);
  });

  // Bug caught: the DM closed the editor while the model was writing, and the paid text was lost.
  it("lists the person on the card when the editor closed during the run, and fills nothing", async () => {
    const store = useAskFormFillStore();
    const apply = openForm("npc_sheet");
    mocks.npc.mockImplementation(async () => {
      // The DM closes the editor while the model writes.
      store.forms = {};
      return { name: "Mira", occupation: "Smith" };
    });
    const ended = await useNpcSheetAskAdapter().run(proposal("npc_sheet"));
    expect(apply).not.toHaveBeenCalled();
    expect(ended.parts[0]).toMatchObject({ ok: true, credits: 1 });
    expect(ended.parts.map((p) => p.label)).toEqual(expect.arrayContaining(["Name: Mira", "Occupation: Smith"]));
  });

  // Bug caught: a cancelled new-NPC run overwrote an EXISTING NPC's form: the result went to whichever NPC form was
  // open when the run ended, and a kept result went to the next one that mounted.
  it("never fills another form of the same kind, open at the end of the run or opened afterwards", async () => {
    const store = useAskFormFillStore();
    const newForm = openForm("npc_sheet");
    const otherForm = vi.fn();
    mocks.npc.mockImplementation(async () => {
      // The new-NPC editor is cancelled and an existing NPC's opens before the paid run finishes.
      store.forms = {};
      store.register("npc_sheet", { context: () => undefined, apply: otherForm });
      return { name: "Mira" };
    });
    const ended = await useNpcSheetAskAdapter().run(proposal("npc_sheet"));
    store.register("npc_sheet", { context: () => undefined, apply: otherForm });
    expect(newForm).not.toHaveBeenCalled();
    expect(otherForm).not.toHaveBeenCalled();
    expect(ended.parts[0].label).toContain("is closed");
  });

  // Bug caught: a card whose form was closed before the press still offered to spend credits.
  it("blocks the quote once the form it was opened from is gone, even with another form of the kind open", () => {
    const store = useAskFormFillStore();
    openForm("npc_sheet");
    const card = proposal("npc_sheet");
    store.forms = {};
    store.register("npc_sheet", { context: () => undefined, apply: vi.fn() });
    expect(useNpcSheetAskAdapter().quote(card).block?.message).toContain("is closed");
  });

  // Bug caught: a failed generation reported success and filled the form with nothing.
  it("reports a failed generation and fills nothing", async () => {
    const apply = openForm("npc_sheet");
    mocks.npc.mockResolvedValue(null);
    mocks.error.value = "Generation failed";
    const ended = await useNpcSheetAskAdapter().run(proposal("npc_sheet"));
    expect(apply).not.toHaveBeenCalled();
    expect(ended.parts[0]).toMatchObject({ ok: false, error: "Generation failed" });
  });

  // Bug caught: an alter ego was asked for with the portrait off, and priced and painted a picture nobody wanted.
  it("takes the alter ego only with the portrait", async () => {
    openForm("npc_sheet");
    mocks.npc.mockResolvedValue({ name: "Mira" });
    await useNpcSheetAskAdapter().run(proposal("npc_sheet", { alter_ego: true }));
    expect(mocks.npc).toHaveBeenCalledWith("A baker who lies", { generateImage: false, generateAlterEgo: false });
  });

  // Bug caught: the monster's constraints were dropped on the way, so the stat block ignored the CR the DM set.
  it("passes the monster's constraints to the generation and drops a rating that is not one", async () => {
    const apply = openForm("monster_sheet");
    mocks.monster.mockResolvedValue({ name: "Gloom" });
    await useMonsterSheetAskAdapter().run(proposal("monster_sheet", { challenge_rating: "1/2", monster_type: "Undead", size: "large" }));
    expect(mocks.monster).toHaveBeenCalledWith("A baker who lies", { challenge_rating: "1/2", monster_type: "undead", size: "large", generateImage: false });
    await useMonsterSheetAskAdapter().run(proposal("monster_sheet", { challenge_rating: "lots" }));
    expect(mocks.monster.mock.calls[1][1].challenge_rating).toBeUndefined();
    expect(apply).toHaveBeenCalledTimes(2);
  });

  // Bug caught: a cantrip's level 0 read as "any level".
  it("keeps a cantrip's level 0 for the spell", async () => {
    openForm("spell_sheet");
    mocks.spell.mockResolvedValue({ name: "Spark" });
    await useSpellSheetAskAdapter().run(proposal("spell_sheet", { level: "0", school: "Evocation" }));
    expect(mocks.spell).toHaveBeenCalledWith("A baker who lies", { level: 0, school: "evocation", generateImage: false });
  });

  // Bug caught: the draft ignored the date and type of the open event, so it was not about that day.
  it("drafts the description from the open event's date and type, and an empty box is allowed", async () => {
    const apply = openForm("event_description", { dateLabel: "3 Mirtul, 1492", eventType: "festival" });
    mocks.event.mockResolvedValue({ title: "Harvest", description: "d", event_type: "festival", ai_provenance: null });
    const adapter = useEventDescriptionAskAdapter();
    expect(adapter.quote(proposal("event_description", {}, "")).block).toBeNull();
    await adapter.run(proposal("event_description", {}, ""));
    expect(mocks.event.mock.calls[0][0]).toBe("");
    expect(mocks.event.mock.calls[0][2]).toBe("festival");
    expect(mocks.event.mock.calls[0][1].join(" ")).toContain("3 Mirtul, 1492");
    expect(apply).toHaveBeenCalledOnce();
  });

  // Bug caught: a thousand-character steer was cut by the server and the draft came out about something else.
  it("blocks an event steer over the limit", () => {
    openForm("event_description", { dateLabel: "x", eventType: "world" });
    expect(useEventDescriptionAskAdapter().quote(proposal("event_description", {}, "a".repeat(1001))).block?.message).toContain("1000");
  });

  // Bug caught: busy AI generation started a second paid run.
  it("does not start while another generation is running", async () => {
    openForm("spell_sheet");
    state.busy = true;
    await useSpellSheetAskAdapter().run(proposal("spell_sheet"));
    expect(mocks.spell).not.toHaveBeenCalled();
  });
});
