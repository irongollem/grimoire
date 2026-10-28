import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestPayoffPanel from "./QuestPayoffPanel.vue";
import type { LootPlacement, QuestBeat, QuestBeatEdge, QuestConsequence } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  createConsequence: vi.fn(),
  removeConsequence: vi.fn(),
  createLoot: vi.fn(),
  removeLoot: vi.fn(),
}));

vi.mock("@/composables/quests/useQuestFlow", () => ({
  useCreateQuestConsequence: () => ({ mutateAsync: mocks.createConsequence }),
  useDeleteQuestConsequence: () => ({ mutateAsync: mocks.removeConsequence }),
  useCreateLootPlacement: () => ({ mutateAsync: mocks.createLoot }),
  useDeleteLootPlacement: () => ({ mutateAsync: mocks.removeLoot }),
  // #871: keyed by the ref's own current value, like the real composable —
  // `quest-sequel` has beats (one archived, excluded), `quest-empty` has none.
  useQuestBeats: (id: { value: string } | string) => ({
    data: { get value() {
      const targetId = typeof id === "string" ? id : id.value;
      if (targetId !== "quest-sequel") return [];
      return [
        { id: "beat-rumor", quest_id: "quest-sequel", title: "The rumor" },
        { id: "beat-cauldron", quest_id: "quest-sequel", title: "The cauldron surfaces" },
        { id: "beat-old", quest_id: "quest-sequel", title: "An old, retired scene", kind: "archived" },
      ];
    } },
  }),
}));
vi.mock("@/composables/quests/useQuests", () => ({
  useQuestObjectives: () => ({ data: { value: [{ id: "obj-1", description: "Keep the bridge standing" }] } }),
  // The panel and the shared unlock picker both read the campaign list and filter it themselves.
  useQuests: () => ({ data: { value: [
    { id: "quest-sequel", title: "The stolen cauldron", status: "undiscovered", entry_beat_id: "beat-rumor" },
    { id: "quest-empty", title: "The empty ledger", status: "undiscovered", entry_beat_id: null },
  ] } }),
}));
vi.mock("@/composables/quests/useQuestClocks", () => ({
  useQuestClocks: () => ({ data: { value: [{ id: "clock-1", quest_id: "quest-1", label: "The count", segments: 6, filled: 2 }] } }),
}));
vi.mock("@/composables/factions/useFactions", () => ({
  useAllFactions: () => ({ data: { value: [{ id: "fac-1", name: "Understage Crew" }] } }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useLocationTree: () => ({ locationOptions: { value: [{ id: "loc-vault", name: "The Inner Vault", depth: 0 }] } }),
}));
vi.mock("@/composables/npcs/useNpcs", () => ({
  useNpcs: () => ({ data: { value: [{ id: "npc-1", name: "Oarus Masthew" }] } }),
}));
vi.mock("@/composables/items/useItemIndex", () => ({
  useItemIndex: () => ({ data: { value: [{ id: "item-1", name: "Tally-stick", campaign_id: "campaign-1" }] } }),
}));
vi.mock("@/composables/scriptorium/useScriptorium", () => ({
  useScriptoriumDocuments: () => ({ data: { value: [
    { id: "doc-map", title: "The smuggler's map", campaign_id: "campaign-1" },
    { id: "doc-shared", title: "A letter from nowhere", campaign_id: null },
    { id: "doc-elsewhere", title: "Another table's note", campaign_id: "other-campaign" },
  ] } }),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "dm" } }) }));

const beat = { id: "beat-fork", quest_id: "quest-1", campaign_id: "campaign-1", title: "Confront Ser Vallis" } as QuestBeat;
const beats = [
  beat,
  { id: "beat-confess", quest_id: "quest-1", title: "He confesses the tithe" },
] as QuestBeat[];
const edges = [
  { id: "edge-confess", quest_id: "quest-1", source_beat_id: "beat-fork", target_beat_id: "beat-confess", route_kind: "choice" },
] as QuestBeatEdge[];

function consequence(overrides: Partial<QuestConsequence> & { id: string }): QuestConsequence {
  return {
    quest_id: "quest-1", on_beat_id: null, on_edge_id: null, on_objective_id: null, on_objective_status: null,
    on_quest_settled: false, on_location_id: null, on_location_fact: null, entry_beat_id: null, after_days: 0, action: "grant_knowledge", target_objective_id: null,
    target_npc_id: null, target_quest_id: null, target_document_id: null, target_clock_id: null, target_location_id: null, target_faction_id: null, on_clock_id: null, action_payload: {},
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function loot(overrides: Partial<LootPlacement> & { id: string }): LootPlacement {
  return {
    beat_id: "beat-fork", quest_id: "quest-1", location_id: null, campaign_id: "campaign-1", kind: "item",
    item_id: null, library_item_id: null, quantity: 1, label: "Tally-stick of the widow", payload: {}, source_type: "prepared",
    source_id: null, sort_order: 0, dispatch_message_id: null, dispatched_at: null, delivery_state: "held",
    quantity_remaining: 1, claimed_by_names: [], handed_out_this_session: false,
    ...overrides,
  };
}

function mountPanel(props: Partial<InstanceType<typeof QuestPayoffPanel>["$props"]> = {}) {
  return mount(QuestPayoffPanel, {
    props: { beat, edges, beats, consequences: [], loot: [], ...props },
    global: { stubs: { EntityCombobox: true } },
  });
}

describe("QuestPayoffPanel", () => {
  beforeEach(() => {
    mocks.createConsequence.mockReset();
    mocks.removeConsequence.mockReset();
    mocks.createLoot.mockReset();
    mocks.removeLoot.mockReset();
  });

  it("merges this beat's consequences and loot into one ordered list", () => {
    const wrapper = mountPanel({
      consequences: [consequence({ id: "c-1", on_beat_id: "beat-fork", action: "award_milestone", action_payload: { text: "Renown" } })],
      loot: [loot({ id: "loot-1" })],
    });
    const rows = wrapper.findAll("ul li");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.text()).toContain("Milestone: \"Renown\"");
    expect(rows[0]!.text()).toContain("auto");
    expect(rows[1]!.text()).toContain("Tally-stick of the widow");
    expect(rows[1]!.text()).toContain("you dispatch");
  });

  it("removes a consequence row through the consequence mutation", async () => {
    const wrapper = mountPanel({
      consequences: [consequence({ id: "c-1", on_beat_id: "beat-fork", action: "award_milestone", action_payload: { text: "Renown" } })],
    });
    await wrapper.findAll("button").find((button) => button.text() === "Remove")!.trigger("click");
    await flushPromises();
    expect(mocks.removeConsequence).toHaveBeenCalledWith({ id: "c-1", questId: "quest-1" });
  });

  it("says so when a remove is refused, instead of leaving the row there in silence", async () => {
    mocks.removeLoot.mockRejectedValue(new Error("permission denied"));
    const wrapper = mountPanel({ loot: [loot({ id: "loot-1" })] });
    await wrapper.findAll("button").find((button) => button.text() === "Remove")!.trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("permission denied");
  });

  it("removes a loot row through the loot mutation, keyed by campaign", async () => {
    const wrapper = mountPanel({ loot: [loot({ id: "loot-1" })] });
    await wrapper.findAll("button").find((button) => button.text() === "Remove")!.trigger("click");
    await flushPromises();
    expect(mocks.removeLoot).toHaveBeenCalledWith({ id: "loot-1", campaignId: "campaign-1" });
  });

  it("opens the influence quick-add and authors a disposition shift with a signed step", async () => {
    const wrapper = mountPanel();
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Influence")!.trigger("click");
    wrapper.findComponent({ name: "EntityCombobox" }).vm.$emit("update:modelValue", "npc-1");
    await wrapper.findAll("select").at(-1)!.setValue("step:-1");
    await wrapper.findAll("button").find((button) => button.text() === "Add")!.trigger("click");
    await flushPromises();

    expect(mocks.createConsequence).toHaveBeenCalledWith(expect.objectContaining({
      quest_id: "quest-1",
      on_beat_id: "beat-fork",
      on_edge_id: null,
      action: "shift_npc_relationship",
      target_npc_id: "npc-1",
      action_payload: { step: -1 },
    }));
  });

  // The stance form the maintainer asked for: "indifferent to helpful" is a
  // stance stated outright, and the default, since it is what a DM reaches
  // for at the table.
  it("authors an absolute stance by default — the NPC becomes friendly", async () => {
    const wrapper = mountPanel();
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Influence")!.trigger("click");
    wrapper.findComponent({ name: "EntityCombobox" }).vm.$emit("update:modelValue", "npc-1");
    await flushPromises();
    expect(wrapper.findAll("select").at(-1)!.text()).toContain("Becomes helpful");
    await wrapper.findAll("button").find((button) => button.text() === "Add")!.trigger("click");
    await flushPromises();

    expect(mocks.createConsequence).toHaveBeenCalledWith(expect.objectContaining({
      action: "shift_npc_relationship",
      target_npc_id: "npc-1",
      action_payload: { to: "friendly" },
    }));
  });

  it("quick-adds a clock tick, a move, a companion and a standing shift", async () => {
    const quickAdd = async (wrapper: ReturnType<typeof mountPanel>, label: string) => {
      await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === label)!.trigger("click");
      await flushPromises();
    };
    const add = async (wrapper: ReturnType<typeof mountPanel>) => {
      await wrapper.findAll("button").find((button) => button.text() === "Add")!.trigger("click");
      await flushPromises();
    };

    let wrapper = mountPanel();
    await quickAdd(wrapper, "Tick clock");
    wrapper.findComponent({ name: "EntityCombobox" }).vm.$emit("update:modelValue", "clock-1");
    await flushPromises();
    await add(wrapper);
    expect(mocks.createConsequence).toHaveBeenLastCalledWith(expect.objectContaining({
      action: "tick_clock", target_clock_id: "clock-1", on_beat_id: "beat-fork", action_payload: { step: 1 },
    }));

    wrapper = mountPanel();
    await quickAdd(wrapper, "Move NPC");
    const [npc, place] = wrapper.findAllComponents({ name: "EntityCombobox" });
    npc!.vm.$emit("update:modelValue", "npc-1");
    place!.vm.$emit("update:modelValue", "loc-vault");
    await flushPromises();
    await add(wrapper);
    expect(mocks.createConsequence).toHaveBeenLastCalledWith(expect.objectContaining({
      action: "move_npc", target_npc_id: "npc-1", target_location_id: "loc-vault",
    }));

    wrapper = mountPanel();
    await quickAdd(wrapper, "Companion");
    wrapper.findComponent({ name: "EntityCombobox" }).vm.$emit("update:modelValue", "npc-1");
    await flushPromises();
    await add(wrapper);
    expect(mocks.createConsequence).toHaveBeenLastCalledWith(expect.objectContaining({
      action: "add_companion", target_npc_id: "npc-1", action_payload: {},
    }));

    wrapper = mountPanel();
    await quickAdd(wrapper, "Standing");
    wrapper.findComponent({ name: "EntityCombobox" }).vm.$emit("update:modelValue", "fac-1");
    await flushPromises();
    await add(wrapper);
    expect(mocks.createConsequence).toHaveBeenLastCalledWith(expect.objectContaining({
      action: "shift_faction_standing", target_faction_id: "fac-1", action_payload: { to: "friendly" },
    }));
  });

  it("conditions a quick-add on a named route rather than arrival", async () => {
    const wrapper = mountPanel();
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Milestone")!.trigger("click");
    await wrapper.findAll("select")[0]!.setValue("edge-confess");
    await wrapper.find('input[placeholder="What did the party earn…"]').setValue("Renown among the dockworkers.");
    await wrapper.findAll("button").find((button) => button.text() === "Add")!.trigger("click");
    await flushPromises();

    expect(mocks.createConsequence).toHaveBeenCalledWith(expect.objectContaining({
      on_beat_id: null,
      on_edge_id: "edge-confess",
      action: "award_milestone",
      action_payload: { text: "Renown among the dockworkers." },
    }));
  });

  it.each([
    ["an own vault item", "3f2b8c1e-5a4d-4c9a-8b7e-1d2e3f4a5b6c", { item_id: "3f2b8c1e-5a4d-4c9a-8b7e-1d2e3f4a5b6c", library_item_id: null }],
    ["a shared library item", "srd_grimoire_bundled_torch", { item_id: null, library_item_id: "srd_grimoire_bundled_torch" }],
  ])("opens the item quick-add and prepares loot for %s in the matching column", async (_name, pickedId, columns) => {
    const wrapper = mountPanel();
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Item")!.trigger("click");
    wrapper.findComponent({ name: "EntityCombobox" }).vm.$emit("update:modelValue", pickedId);
    await flushPromises();
    await wrapper.findAll("button").find((button) => button.text() === "Add")!.trigger("click");
    await flushPromises();

    expect(mocks.createLoot).toHaveBeenCalledWith(expect.objectContaining({
      beat_id: "beat-fork",
      quest_id: "quest-1",
      campaign_id: "campaign-1",
      kind: "item",
      source_type: "prepared",
      ...columns,
    }));
  });

  it("shows an empty-state direction when the beat gives nothing yet", () => {
    const wrapper = mountPanel();
    expect(wrapper.text()).toContain("Nothing this beat gives yet.");
  });

  // #871: the "Enters at" combobox on the Quest quick-add.
  describe("the entry-beat bridge on a quest unlock", () => {
    async function openQuestQuickAdd(wrapper: ReturnType<typeof mountPanel>) {
      await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Quest")!.trigger("click");
    }

    it("preselects the target's own entry beat, marked in its option name", async () => {
      const wrapper = mountPanel();
      await openQuestQuickAdd(wrapper);
      wrapper.findComponent({ name: "EntityCombobox" }).vm.$emit("update:modelValue", "quest-sequel");
      await flushPromises();

      const comboboxes = wrapper.findAllComponents({ name: "EntityCombobox" });
      expect(comboboxes).toHaveLength(2);
      expect(comboboxes[1]!.props("modelValue")).toBe("beat-rumor");
      const options = comboboxes[1]!.props("options") as Array<{ id: string; name: string }>;
      expect(options.map((o) => o.id)).toEqual(["beat-rumor", "beat-cauldron"]);
      expect(options.find((o) => o.id === "beat-rumor")!.name).toBe("The rumor · entry");
    });

    it("writes null when the entry beat stays selected", async () => {
      const wrapper = mountPanel();
      await openQuestQuickAdd(wrapper);
      wrapper.findComponent({ name: "EntityCombobox" }).vm.$emit("update:modelValue", "quest-sequel");
      await flushPromises();
      await wrapper.findAll("button").find((button) => button.text() === "Add")!.trigger("click");
      await flushPromises();

      expect(mocks.createConsequence).toHaveBeenCalledWith(expect.objectContaining({
        action: "unlock_quest",
        target_quest_id: "quest-sequel",
        entry_beat_id: null,
      }));
    });

    it("writes the chosen beat id when the DM picks a beat other than the entry", async () => {
      const wrapper = mountPanel();
      await openQuestQuickAdd(wrapper);
      wrapper.findComponent({ name: "EntityCombobox" }).vm.$emit("update:modelValue", "quest-sequel");
      await flushPromises();
      wrapper.findAllComponents({ name: "EntityCombobox" })[1]!.vm.$emit("update:modelValue", "beat-cauldron");
      await flushPromises();
      await wrapper.findAll("button").find((button) => button.text() === "Add")!.trigger("click");
      await flushPromises();

      expect(mocks.createConsequence).toHaveBeenCalledWith(expect.objectContaining({
        action: "unlock_quest",
        target_quest_id: "quest-sequel",
        entry_beat_id: "beat-cauldron",
      }));
    });

    it("shows a no-beats caption instead of a combobox when the target has no beats yet", async () => {
      const wrapper = mountPanel();
      await openQuestQuickAdd(wrapper);
      wrapper.findComponent({ name: "EntityCombobox" }).vm.$emit("update:modelValue", "quest-empty");
      await flushPromises();

      expect(wrapper.findAllComponents({ name: "EntityCombobox" })).toHaveLength(1);
      expect(wrapper.text()).toContain("This quest has no beats yet. It will open at whichever beat is written first.");
    });
  });

  describe("give_handout", () => {
    it("adds a Handout payoff naming one of the campaign's own documents", async () => {
      const wrapper = mountPanel();
      await wrapper.findAll("button").find((button) => button.text() === "Handout")!.trigger("click");
      const box = wrapper.findComponent({ name: "EntityCombobox" });
      expect((box.props("options") as Array<{ id: string }>).map((o) => o.id)).toEqual(["doc-map"]);
      box.vm.$emit("update:modelValue", "doc-map");
      await flushPromises();
      await wrapper.findAll("button").find((button) => button.text() === "Add")!.trigger("click");
      await flushPromises();

      expect(mocks.createConsequence).toHaveBeenCalledWith(expect.objectContaining({
        action: "give_handout",
        on_beat_id: "beat-fork",
        target_document_id: "doc-map",
        action_payload: {},
      }));
    });
  });

  describe("authoring a payoff", () => {
    const open = async (wrapper: ReturnType<typeof mountPanel>, label: string) => {
      await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === label)!.trigger("click");
    };
    const addButton = (w: ReturnType<typeof mountPanel>) => w.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Add")!;
    const text = (w: ReturnType<typeof mountPanel>, placeholder: string) => w.get(`input[placeholder^="${placeholder}"]`);
    const combo = (w: ReturnType<typeof mountPanel>, at = 0) => w.findAllComponents({ name: "EntityCombobox" })[at]!;
    const submit = async (w: ReturnType<typeof mountPanel>) => {
      await addButton(w).trigger("click");
      await flushPromises();
    };

    it("the 'when this fires' choice lists this beat's own routes only", async () => {
      const elsewhere = { id: "edge-elsewhere", quest_id: "quest-1", source_beat_id: "beat-confess", target_beat_id: "beat-fork", route_kind: "choice" } as QuestBeatEdge;
      const wrapper = mountPanel({ edges: [...edges, elsewhere] });
      await open(wrapper, "Knowledge");
      const options = wrapper.get('select[aria-label="When this fires"]').findAll("option").map((o) => o.text());
      expect(options).toEqual(["On arriving here", "On taking the route to He confesses the tithe"]);
    });

    it("a row about an objective that has since been deleted says so", () => {
      const wrapper = mountPanel({ consequences: [consequence({ id: "c-1", on_beat_id: "beat-fork", action: "complete", target_objective_id: "obj-gone" })] });
      expect(wrapper.get("ul li").text()).toContain('"Objective removed"');
    });

    it("a row on a route whose beat is gone says 'Missing beat'", () => {
      const dangling = { id: "edge-dangling", quest_id: "quest-1", source_beat_id: "beat-fork", target_beat_id: "beat-deleted", route_kind: "choice" } as QuestBeatEdge;
      const wrapper = mountPanel({ edges: [dangling] });
      return open(wrapper, "Knowledge").then(() => {
        expect(wrapper.get('select[aria-label="When this fires"]').text()).toContain("On taking the route to Missing beat");
      });
    });

    it("clicking the open quick-add again closes it, and a different one replaces it with empty fields", async () => {
      const wrapper = mountPanel();
      await open(wrapper, "Knowledge");
      await text(wrapper, "What do the players learn").setValue("The bell is hollow");
      await open(wrapper, "Knowledge");
      expect(wrapper.find('input[placeholder^="What do the players learn"]').exists()).toBe(false);
      await open(wrapper, "Knowledge");
      expect((text(wrapper, "What do the players learn").element as HTMLInputElement).value).toBe("");
      await text(wrapper, "What do the players learn").setValue("typed");
      await open(wrapper, "Milestone");
      expect(wrapper.find('input[placeholder^="What do the players learn"]').exists()).toBe(false);
      expect((text(wrapper, "What did the party earn").element as HTMLInputElement).value).toBe("");
    });

    it("selecting another beat closes the open quick-add", async () => {
      const wrapper = mountPanel();
      await open(wrapper, "Knowledge");
      await wrapper.setProps({ beat: { ...beat, id: "beat-other" } });
      expect(wrapper.find('input[placeholder^="What do the players learn"]').exists()).toBe(false);
    });

    it.each([
      ["Knowledge", "What do the players learn", "   "],
      ["Milestone", "What did the party earn", "   "],
    ])("%s needs text that is not just spaces", async (label, placeholder, blank) => {
      const wrapper = mountPanel();
      await open(wrapper, label);
      await text(wrapper, placeholder).setValue(blank);
      expect(addButton(wrapper).props("disabled")).toBe(true);
      await text(wrapper, placeholder).setValue("Something");
      expect(addButton(wrapper).props("disabled")).toBe(false);
    });

    it("Favour needs both an NPC and the favour itself", async () => {
      const wrapper = mountPanel();
      await open(wrapper, "Favour");
      await text(wrapper, "What do they owe").setValue("A night's shelter");
      expect(addButton(wrapper).props("disabled")).toBe(true);
      combo(wrapper).vm.$emit("update:modelValue", "npc-1");
      await wrapper.vm.$nextTick();
      expect(addButton(wrapper).props("disabled")).toBe(false);
      await submit(wrapper);
      expect(mocks.createConsequence).toHaveBeenCalledWith(expect.objectContaining({
        action: "owe_favor", target_npc_id: "npc-1", action_payload: { text: "A night's shelter" },
      }));
    });

    it("Knowledge is stored trimmed, fires on arrival by default, and closes the form once added", async () => {
      const wrapper = mountPanel();
      await open(wrapper, "Knowledge");
      await text(wrapper, "What do the players learn").setValue("  The bell is hollow  ");
      await submit(wrapper);
      expect(mocks.createConsequence).toHaveBeenCalledWith(expect.objectContaining({
        action: "grant_knowledge", on_beat_id: "beat-fork", target_npc_id: null, after_days: 0, entry_beat_id: null, action_payload: { text: "The bell is hollow" },
      }));
      expect(wrapper.find('input[placeholder^="What do the players learn"]').exists()).toBe(false);
    });

    it("carries the 'days later' delay onto the consequence", async () => {
      const wrapper = mountPanel();
      await open(wrapper, "Milestone");
      await text(wrapper, "What did the party earn").setValue("Renown");
      await wrapper.findAll("input[type=number]")[0]!.setValue(3);
      await submit(wrapper);
      expect(mocks.createConsequence).toHaveBeenCalledWith(expect.objectContaining({ after_days: 3 }));
    });

    it("an event leaves out an empty description and trims one that is given", async () => {
      const wrapper = mountPanel();
      await open(wrapper, "Event");
      await text(wrapper, "Event title").setValue("  The Harvest Fair  ");
      await submit(wrapper);
      expect(mocks.createConsequence).toHaveBeenLastCalledWith(expect.objectContaining({
        action: "create_calendar_event", action_payload: { title: "The Harvest Fair", event_type: "quest" },
      }));
      await open(wrapper, "Event");
      await text(wrapper, "Event title").setValue("Fair");
      await text(wrapper, "Description").setValue("  Stalls and music  ");
      await submit(wrapper);
      expect(mocks.createConsequence).toHaveBeenLastCalledWith(expect.objectContaining({
        action_payload: { title: "Fair", event_type: "quest", description: "Stalls and music" },
      }));
    });

    it("Item needs an item and a quantity above zero, rounds the quantity down, and puts the loot after what is already there", async () => {
      const wrapper = mountPanel({ loot: [loot({ id: "l-a" }), loot({ id: "l-b" })] });
      await open(wrapper, "Item");
      combo(wrapper).vm.$emit("update:modelValue", "item-1");
      await wrapper.vm.$nextTick();
      await wrapper.get('input[type="number"][min="1"]').setValue(0);
      expect(addButton(wrapper).props("disabled")).toBe(true);
      await wrapper.get('input[type="number"][min="1"]').setValue(2.9);
      expect(addButton(wrapper).props("disabled")).toBe(false);
      await submit(wrapper);
      expect(mocks.createLoot).toHaveBeenCalledWith(expect.objectContaining({
        kind: "item", quantity: 2, sort_order: 2, beat_id: "beat-fork", campaign_id: "campaign-1", payload: {},
      }));
    });

    it("Riches needs at least one coin, and is always one entry carrying the purse", async () => {
      const wrapper = mountPanel();
      await open(wrapper, "Riches");
      expect(wrapper.findAll("label.uppercase")).toHaveLength(5);
      expect(addButton(wrapper).props("disabled")).toBe(true);
      await wrapper.findAll("label.uppercase").find((l) => l.text().toLowerCase() === "gp")!.get("input").setValue(25);
      expect(addButton(wrapper).props("disabled")).toBe(false);
      await submit(wrapper);
      expect(mocks.createLoot).toHaveBeenCalledWith(expect.objectContaining({
        kind: "currency", quantity: 1, payload: { pp: 0, gp: 25, ep: 0, sp: 0, cp: 0 },
      }));
    });

    it("only undiscovered quests other than this one can be unlocked, and the entry beat is sent for a quest unlock only", async () => {
      const wrapper = mountPanel();
      await open(wrapper, "Quest");
      expect(combo(wrapper).props("options").map((o: { id: string }) => o.id)).toEqual(["quest-sequel", "quest-empty"]);
      const own = mountPanel({ beat: { ...beat, quest_id: "quest-sequel" } as QuestBeat });
      await open(own, "Quest");
      expect(combo(own).props("options").map((o: { id: string }) => o.id)).toEqual(["quest-empty"]);
      await open(wrapper, "Milestone");
      await text(wrapper, "What did the party earn").setValue("Renown");
      await submit(wrapper);
      expect(mocks.createConsequence).toHaveBeenLastCalledWith(expect.objectContaining({ action: "award_milestone", entry_beat_id: null }));
    });

    it("a failed add keeps the form, shows why, and a removal in flight is released afterwards", async () => {
      mocks.createConsequence.mockRejectedValueOnce("refused");
      const wrapper = mountPanel();
      await open(wrapper, "Milestone");
      await text(wrapper, "What did the party earn").setValue("Renown");
      await submit(wrapper);
      expect(wrapper.get('[role="alert"]').text()).toBe("Could not add this payoff");
      expect(addButton(wrapper).props("loading")).toBe(false);
      expect(wrapper.find('input[placeholder^="What did the party earn"]').exists()).toBe(true);
    });

    it("a finished removal releases the row's Remove button", async () => {
      mocks.removeConsequence.mockResolvedValue(undefined);
      const wrapper = mountPanel({ consequences: [consequence({ id: "c-1", on_beat_id: "beat-fork", action: "award_milestone", action_payload: { text: "Renown" } })] });
      const remove = () => wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Remove")!;
      await remove().trigger("click");
      await flushPromises();
      expect(remove().props("loading")).toBe(false);
    });

    it("a payoff that is not about an NPC names no NPC", async () => {
      const wrapper = mountPanel();
      await open(wrapper, "Knowledge");
      await text(wrapper, "What do the players learn").setValue("x");
      await submit(wrapper);
      expect(mocks.createConsequence.mock.calls.at(-1)![0].target_npc_id).toBeNull();
    });
  });
});
