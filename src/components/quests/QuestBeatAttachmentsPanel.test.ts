import { shallowMount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import QuestBeatAttachmentsPanel from "./QuestBeatAttachmentsPanel.vue";
import type { QuestBeat, QuestBeatAttachmentSummary } from "@/types/quest.types";

const helpers = vi.hoisted(() => ({
  emptyQuery: () => ({ data: { value: [] } }),
  mutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/composables/quests/useQuestFlow", () => ({
  useCreateQuestBeatAttachment: helpers.mutation,
  useDeleteQuestBeatAttachment: helpers.mutation,
  useSetQuestBeatAttachmentRequired: helpers.mutation,
}));
vi.mock("@/composables/encounters/useEncounters", () => ({ useCreateEncounter: helpers.mutation, useEncounters: helpers.emptyQuery }));
vi.mock("@/composables/factions/useFactions", () => ({ useAllFactions: helpers.emptyQuery }));
vi.mock("@/composables/notes/useNotes", () => ({ useNotes: helpers.emptyQuery }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: helpers.emptyQuery }));
vi.mock("@/composables/items/useItems", () => ({ useItems: helpers.emptyQuery }));
vi.mock("@/composables/monsters/useMonsters", () => ({ useMonsters: helpers.emptyQuery }));
vi.mock("@/composables/scriptorium/useScriptorium", () => ({ useScriptoriumDocuments: helpers.emptyQuery }));
vi.mock("@/composables/soundboard/useSoundboardPlaylists", () => ({ usePlaylists: helpers.emptyQuery }));
vi.mock("@/composables/soundboard/useSounds", () => ({ useSounds: helpers.emptyQuery }));

const beat = {
  id: "beat-1",
  quest_id: "quest-1",
  campaign_id: "campaign-1",
  title: "Arrival",
} as QuestBeat;

describe("QuestBeatAttachmentsPanel", () => {
  it("wraps placement actions below controls in the narrow inspector", () => {
    const wrapper = shallowMount(QuestBeatAttachmentsPanel, { props: { beat, attachments: [] } });
    const form = wrapper.get('[data-testid="beat-attachment-form"]');

    expect(form.classes()).toContain("min-w-0");
    expect(form.classes()).toContain("grid-cols-[minmax(0,9rem)_minmax(0,1fr)]");
    expect(form.find("div.col-span-2").exists()).toBe(true);
  });

  it("offers sounds, ambient scenes, and music playlists separately", () => {
    const wrapper = shallowMount(QuestBeatAttachmentsPanel, {
      props: { beat, attachments: [] },
      global: { stubs: { AppSelect: { template: "<select><slot /></select>" } } },
    });

    expect(wrapper.get('option[value="sound"]').text()).toBe("Sound");
    expect(wrapper.get('option[value="audio_scene"]').text()).toBe("Audio scene");
    expect(wrapper.get('option[value="playlist"]').text()).toBe("Playlist");
  });

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
    expect(wrapper.get(".sr-only").text()).toBe("Required, missing — prep gap");
    const buttons = wrapper.findAllComponents({ name: "AppButton" });
    expect(buttons.some((button) => button.props("label") === "Attach")).toBe(true);
    expect(buttons.some((button) => button.props("label") === "Edit")).toBe(false);
  });

  it("falls back to explaining an optional placement stays out of the prep-gap count when it carries no detail of its own", () => {
    const wrapper = shallowMount(QuestBeatAttachmentsPanel, {
      props: { beat, attachments: [attachment({ id: "a-1", is_required: false, compact_detail: null })] },
    });
    expect(wrapper.get(".sr-only").text()).toBe("Optional");
    expect(wrapper.text()).toContain("Optional fallback — kept out of the prep-gap count");
  });
});
