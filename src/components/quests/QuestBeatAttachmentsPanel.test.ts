import { shallowMount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import QuestBeatAttachmentsPanel from "./QuestBeatAttachmentsPanel.vue";
import type { QuestBeat } from "@/types/quest.types";

const helpers = vi.hoisted(() => ({
  emptyQuery: () => ({ data: { value: [] } }),
  mutation: () => ({ mutateAsync: vi.fn() }),
}));

vi.mock("@/composables/useQuestFlow", () => ({
  useCreateQuestBeatAttachment: helpers.mutation,
  useDeleteQuestBeatAttachment: helpers.mutation,
  useSetQuestBeatAttachmentRequired: helpers.mutation,
}));
vi.mock("@/composables/useEncounters", () => ({ useCreateEncounter: helpers.mutation, useEncounters: helpers.emptyQuery }));
vi.mock("@/composables/useFactions", () => ({ useAllFactions: helpers.emptyQuery }));
vi.mock("@/composables/useLocations", () => ({ useAllLocations: helpers.emptyQuery }));
vi.mock("@/composables/useNotes", () => ({ useNotes: helpers.emptyQuery }));
vi.mock("@/composables/useNpcs", () => ({ useNpcs: helpers.emptyQuery }));
vi.mock("@/composables/useItems", () => ({ useItems: helpers.emptyQuery }));
vi.mock("@/composables/useMonsters", () => ({ useMonsters: helpers.emptyQuery }));
vi.mock("@/composables/useQuests", () => ({ useQuestObjectives: helpers.emptyQuery }));
vi.mock("@/composables/useScriptorium", () => ({ useScriptoriumDocuments: helpers.emptyQuery }));
vi.mock("@/composables/useSoundboardPlaylists", () => ({ usePlaylists: helpers.emptyQuery }));
vi.mock("@/composables/useSounds", () => ({ useSounds: helpers.emptyQuery }));

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
});
