import { flushPromises, mount, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestBeatAttachmentsPanel from "./QuestBeatAttachmentsPanel.vue";
import type { QuestBeat, QuestBeatAttachmentSummary } from "@/types/quest.types";

const helpers = vi.hoisted(() => ({
  data: {
    npcs: [] as { id: string; name: string }[],
    playlists: [] as { id: string; name: string; playlist_type: string }[],
    documents: [] as { id: string; title: string; campaign_id: string | null }[],
  },
  createAttachment: vi.fn(),
  deleteAttachment: vi.fn(),
  setRequired: vi.fn(),
  createEncounter: vi.fn(),
  empty: () => ({ data: { value: [] } }),
}));

vi.mock("@/composables/quests/useQuestFlow", () => ({
  useCreateQuestBeatAttachment: () => ({ mutateAsync: helpers.createAttachment }),
  useDeleteQuestBeatAttachment: () => ({ mutateAsync: helpers.deleteAttachment }),
  useSetQuestBeatAttachmentRequired: () => ({ mutateAsync: helpers.setRequired }),
}));
vi.mock("@/composables/encounters/useEncounters", () => ({ useCreateEncounter: () => ({ mutateAsync: helpers.createEncounter }), useEncounters: helpers.empty }));
vi.mock("@/composables/factions/useFactions", () => ({ useAllFactions: helpers.empty }));
vi.mock("@/composables/notes/useNotes", () => ({ useNotes: helpers.empty }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: { value: helpers.data.npcs } }) }));
vi.mock("@/composables/items/useItemIndex", () => ({ useItemIndex: helpers.empty }));
vi.mock("@/composables/monsters/useMonsterIndex", () => ({ useMonsterIndex: helpers.empty }));
vi.mock("@/composables/scriptorium/useScriptorium", () => ({ useScriptoriumDocuments: () => ({ data: { value: helpers.data.documents } }) }));
vi.mock("@/composables/soundboard/useSoundboardPlaylists", () => ({ usePlaylists: () => ({ data: { value: helpers.data.playlists } }) }));
vi.mock("@/composables/soundboard/useSounds", () => ({ useSounds: helpers.empty }));

const beat = {
  id: "beat-1",
  quest_id: "quest-1",
  campaign_id: "campaign-1",
  title: "Arrival",
} as QuestBeat;

describe("QuestBeatAttachmentsPanel", () => {
  function attachment(overrides: Partial<QuestBeatAttachmentSummary> & { id: string }): QuestBeatAttachmentSummary {
    return {
      beat_id: "beat-1", quest_id: "quest-1", campaign_id: "campaign-1", attachment_type: "npc", ref_id: "npc-1",
      role: "", is_required: true, metadata: {}, sort_order: 0, created_by: "dm", created_at: "now",
      label: "Ser Vallis", target_exists: true, prep_gap: false, compact_detail: null, full_editor_to: "/npcs/npc-1",
      ...overrides,
    };
  }

  it("marks a required, present placement done and offers to edit it", () => {
    const wrapper = shallowMount(QuestBeatAttachmentsPanel, { props: { beat, attachments: [attachment({ id: "a-1" })] } });
    expect(wrapper.get(".sr-only").text()).toBe("Required, present");
    const buttons = wrapper.findAllComponents({ name: "AppButton" });
    expect(buttons.some((button) => button.props("label") === "Edit")).toBe(true);
    expect(buttons.some((button) => button.props("label") === "Attach")).toBe(false);
  });

  it("marks a required, missing placement a prep gap and offers to attach a replacement", () => {
    const wrapper = shallowMount(QuestBeatAttachmentsPanel, {
      props: { beat, attachments: [attachment({ id: "a-1", target_exists: false, compact_detail: null })] },
    });
    expect(wrapper.get(".sr-only").text()).toBe("Required, missing, prep gap");
    const buttons = wrapper.findAllComponents({ name: "AppButton" });
    expect(buttons.some((button) => button.props("label") === "Attach")).toBe(true);
    expect(buttons.some((button) => button.props("label") === "Edit")).toBe(false);
  });

  it("falls back to explaining an optional placement stays out of the prep-gap count when it carries no detail of its own", () => {
    const wrapper = shallowMount(QuestBeatAttachmentsPanel, {
      props: { beat, attachments: [attachment({ id: "a-1", is_required: false, compact_detail: null })] },
    });
    expect(wrapper.get(".sr-only").text()).toBe("Optional");
    expect(wrapper.text()).toContain("Optional fallback, kept out of the prep-gap count");
  });

  it("renders a check placement with its green mark, skill/DC label, and contested-by caption", () => {
    const wrapper = shallowMount(QuestBeatAttachmentsPanel, {
      props: {
        beat,
        attachments: [attachment({
          id: "a-check", attachment_type: "check", ref_id: "check", metadata: { skill: "Insight", dc: 15, contested_by: "Deception" },
          label: "Insight DC 15", compact_detail: "Contested by Deception", full_editor_to: null,
        })],
      },
    });
    expect(wrapper.get(".sr-only").text()).toBe("Required, present");
    expect(wrapper.text()).toContain("Insight DC 15");
    expect(wrapper.text()).toContain("Contested by Deception");
  });

  it("swaps the ref-id combobox for a skill/DC/contested-by/note form when Check is chosen, and places it with ref_id \"check\"", async () => {
    helpers.createAttachment.mockReset();
    const wrapper = mount(QuestBeatAttachmentsPanel, {
      props: { beat, attachments: [] },
      global: { stubs: { EntityCombobox: true, QuestRunContainedTool: true, RouterLink: { template: "<a><slot /></a>" }, PaywallModal: true } },
    });

    await wrapper.get('[aria-label="Attachment type"]').setValue("check");
    expect(wrapper.find('[aria-label="Skill"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="DC"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Contested by (optional)"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Note"]').exists()).toBe(true);
    expect(wrapper.findAllComponents({ name: "AppButton" }).some((button) => button.props("label") === "Create new")).toBe(false);

    await wrapper.get('[aria-label="Skill"]').setValue("Insight");
    await wrapper.get('[aria-label="DC"]').setValue(15);
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Place")!.trigger("click");

    expect(helpers.createAttachment).toHaveBeenCalledWith(expect.objectContaining({
      attachment_type: "check",
      ref_id: "check",
      metadata: { skill: "Insight", dc: 15, contested_by: null, note: null },
    }));
  });

  const fullMount = (attachments: QuestBeatAttachmentSummary[] = []) =>
    mount(QuestBeatAttachmentsPanel, {
      props: { beat, attachments },
      global: { stubs: { EntityCombobox: true, QuestRunContainedTool: true, RouterLink: { template: "<a><slot /></a>" }, PaywallModal: true } },
    });
  const btn = (w: ReturnType<typeof fullMount>, label: string) => w.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === label)!;
  const combo = (w: ReturnType<typeof fullMount>) => w.findComponent({ name: "EntityCombobox" });

  beforeEach(() => {
    helpers.createAttachment.mockReset().mockResolvedValue(undefined);
    helpers.deleteAttachment.mockReset().mockResolvedValue(undefined);
    helpers.setRequired.mockReset().mockResolvedValue(undefined);
    helpers.createEncounter.mockReset().mockResolvedValue({ id: "enc-new" });
    helpers.data.npcs = [{ id: "npc-1", name: "Ser Vallis" }];
    helpers.data.playlists = [];
    helpers.data.documents = [];
  });

  it("places the chosen NPC, then empties the picker so Place waits for the next choice", async () => {
    const wrapper = fullMount();
    await wrapper.get('[aria-label="Attachment type"]').setValue("npc");
    expect(btn(wrapper, "Place").props("disabled")).toBe(true);
    combo(wrapper).vm.$emit("update:modelValue", "npc-1");
    await wrapper.vm.$nextTick();
    expect(btn(wrapper, "Place").props("disabled")).toBe(false);
    await btn(wrapper, "Place").trigger("click");
    await flushPromises();
    expect(helpers.createAttachment).toHaveBeenCalledWith(expect.objectContaining({ attachment_type: "npc", ref_id: "npc-1", beat_id: "beat-1" }));
    expect(btn(wrapper, "Place").props("disabled")).toBe(true);
  });

  it("a failed placement keeps the choice, shows why, and settles the button; a retry clears the message", async () => {
    helpers.createAttachment.mockRejectedValueOnce("not an Error").mockResolvedValue(undefined);
    const wrapper = fullMount();
    await wrapper.get('[aria-label="Attachment type"]').setValue("npc");
    combo(wrapper).vm.$emit("update:modelValue", "npc-1");
    await wrapper.vm.$nextTick();
    await btn(wrapper, "Place").trigger("click");
    await flushPromises();
    expect(wrapper.get('[role="alert"]').text()).toBe("Could not place this material");
    expect(btn(wrapper, "Place").props("loading")).toBe(false);
    expect(btn(wrapper, "Place").props("disabled")).toBe(false);
    await btn(wrapper, "Place").trigger("click");
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("changing the kind of material drops the pick made for the old kind", async () => {
    const wrapper = fullMount();
    await wrapper.get('[aria-label="Attachment type"]').setValue("npc");
    combo(wrapper).vm.$emit("update:modelValue", "npc-1");
    await wrapper.vm.$nextTick();
    await wrapper.get('[aria-label="Attachment type"]').setValue("faction");
    expect(btn(wrapper, "Place").props("disabled")).toBe(true);
  });

  it("offers ambient playlists as audio scenes and music playlists as playlists, never the other way round", async () => {
    helpers.data.playlists = [
      { id: "p-amb", name: "Cave drip", playlist_type: "ambient" },
      { id: "p-mus", name: "Tavern tunes", playlist_type: "music" },
    ];
    const wrapper = fullMount();
    await wrapper.get('[aria-label="Attachment type"]').setValue("audio_scene");
    expect(combo(wrapper).props("options")).toEqual([{ id: "p-amb", name: "Cave drip" }]);
    await wrapper.get('[aria-label="Attachment type"]').setValue("playlist");
    expect(combo(wrapper).props("options")).toEqual([{ id: "p-mus", name: "Tavern tunes" }]);
  });

  it("offers handouts from this campaign and from no campaign, not another campaign's", async () => {
    helpers.data.documents = [
      { id: "d-here", title: "Here", campaign_id: "campaign-1" },
      { id: "d-any", title: "Anywhere", campaign_id: null },
      { id: "d-other", title: "Elsewhere", campaign_id: "campaign-2" },
    ];
    const wrapper = fullMount();
    await wrapper.get('[aria-label="Attachment type"]').setValue("handout");
    expect(combo(wrapper).props("options").map((o: { id: string }) => o.id)).toEqual(["d-here", "d-any"]);
  });

  it("a check needs a DC to be placed, trims its note, and resets the form once placed", async () => {
    const wrapper = fullMount();
    await wrapper.get('[aria-label="Attachment type"]').setValue("check");
    expect(btn(wrapper, "Place").props("disabled")).toBe(true);
    await wrapper.get('[aria-label="DC"]').setValue(14);
    await wrapper.get('[aria-label="Note"]').setValue("  Only by torchlight  ");
    expect(btn(wrapper, "Place").props("disabled")).toBe(false);
    await btn(wrapper, "Place").trigger("click");
    await flushPromises();
    expect(helpers.createAttachment).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ dc: 14, note: "Only by torchlight" }),
    }));
    expect(btn(wrapper, "Place").props("disabled")).toBe(true);
    expect((wrapper.get('[aria-label="Note"]').element as HTMLInputElement).value).toBe("");
  });

  it("Remove deletes that placement from this quest, and says so when it cannot", async () => {
    helpers.deleteAttachment.mockRejectedValueOnce("nope");
    const wrapper = fullMount([attachment({ id: "a-1" })]);
    await btn(wrapper, "Remove").trigger("click");
    await flushPromises();
    expect(helpers.deleteAttachment).toHaveBeenCalledWith({ id: "a-1", questId: "quest-1" });
    expect(wrapper.get('[role="alert"]').text()).toBe("Could not remove this placement");
    expect(btn(wrapper, "Remove").props("loading")).toBe(false);
  });

  it("the Needed / Optional toggle flips the placement's requirement", async () => {
    const wrapper = fullMount([attachment({ id: "a-1", is_required: true }), attachment({ id: "a-2", is_required: false, label: "Spare" })]);
    await btn(wrapper, "Needed").trigger("click");
    await btn(wrapper, "Optional").trigger("click");
    expect(helpers.setRequired.mock.calls).toEqual([
      [{ id: "a-1", questId: "quest-1", isRequired: false }],
      [{ id: "a-2", questId: "quest-1", isRequired: true }],
    ]);
  });

  describe("quick encounter", () => {
    const quick = async () => {
      const wrapper = fullMount();
      await wrapper.get('[aria-label="Attachment type"]').setValue("encounter");
      return wrapper;
    };
    it("needs a name, creates the encounter under the trimmed name, places it on this beat and empties the box", async () => {
      const wrapper = await quick();
      await wrapper.get("input[placeholder='Quick encounter name…']").setValue("   ");
      expect(btn(wrapper, "Create & place").props("disabled")).toBe(true);
      await wrapper.get("input[placeholder='Quick encounter name…']").setValue("  Ambush at the ford  ");
      await btn(wrapper, "Create & place").trigger("click");
      await flushPromises();
      expect(helpers.createEncounter).toHaveBeenCalledWith(expect.objectContaining({ name: "Ambush at the ford" }));
      expect(helpers.createAttachment).toHaveBeenCalledWith(expect.objectContaining({ attachment_type: "encounter", ref_id: "enc-new", beat_id: "beat-1" }));
      expect((wrapper.get("input[placeholder='Quick encounter name…']").element as HTMLInputElement).value).toBe("");
    });

    it("an encounter refused for quota opens the paywall and places nothing", async () => {
      helpers.createEncounter.mockRejectedValue({ message: "quota_exceeded" });
      const wrapper = await quick();
      await wrapper.get("input[placeholder='Quick encounter name…']").setValue("Ambush");
      await btn(wrapper, "Create & place").trigger("click");
      await flushPromises();
      expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
      expect(helpers.createAttachment).not.toHaveBeenCalled();
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    });
  });
});
