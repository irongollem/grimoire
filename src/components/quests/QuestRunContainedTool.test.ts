import { shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestRunContainedTool from "./QuestRunContainedTool.vue";
import type { QuestBeatAttachmentSummary, QuestBeatAttachmentType } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  locations: { value: [{ id: "room-1", name: "Crypt", parent_id: "root" }] },
  sounds: { value: [{ id: "sound-1", name: "Thunder", category: "effects", source_type: "url", file_url: "thunder.mp3", storage_path: null }] },
  playlists: { value: [] },
  tracks: { value: [] },
  npc: { value: null as Record<string, unknown> | null },
  faction: { value: null as Record<string, unknown> | null },
  trigger: vi.fn(),
  playPlaylist: vi.fn(),
  stopPlaylist: vi.fn(),
  updateObjective: vi.fn(),
}));

vi.mock("@/composables/useHotkeys", () => ({ useHotkeys: vi.fn() }));
vi.mock("@/composables/useLocations", () => ({ useAllLocations: () => ({ data: mocks.locations }) }));
vi.mock("@/composables/useNpcs", () => ({ useNpc: () => ({ data: mocks.npc }) }));
vi.mock("@/composables/useFactions", () => ({ useFaction: () => ({ data: mocks.faction }) }));
vi.mock("@/composables/useItems", () => ({ useItems: () => ({ data: { value: [] } }) }));
vi.mock("@/composables/useMonsters", () => ({ useMonsters: () => ({ data: { value: [] } }) }));
vi.mock("@/composables/useSounds", () => ({ useSounds: () => ({ data: mocks.sounds }) }));
vi.mock("@/composables/useSoundboardPlaylists", () => ({
  usePlaylists: () => ({ data: mocks.playlists }),
  usePlaylistTracks: () => ({ data: mocks.tracks }),
}));
vi.mock("@/composables/useSoundPlayback", () => ({
  useActionCheck: () => () => "play",
  useBlockedCheck: () => () => null,
  useSoundTrigger: () => mocks.trigger,
}));
vi.mock("@/stores/soundboard", () => ({ useSoundboardStore: () => ({
  isPlaylistActive: () => false,
  playPlaylist: mocks.playPlaylist,
  stopPlaylist: mocks.stopPlaylist,
}) }));
vi.mock("@/composables/useQuests", () => ({
  useQuestObjectives: () => ({ data: { value: [] } }),
  useUpdateObjective: () => ({ mutateAsync: mocks.updateObjective }),
}));

function attachment(type: QuestBeatAttachmentType, overrides: Partial<QuestBeatAttachmentSummary> = {}): QuestBeatAttachmentSummary {
  return {
    id: "a1", beat_id: "b1", quest_id: "q1", campaign_id: "c1", attachment_type: type,
    ref_id: `${type}-1`, role: "", is_required: true, metadata: {}, sort_order: 0,
    created_by: "dm", created_at: "now", label: "Prepared material", target_exists: true,
    prep_gap: false, compact_detail: null, full_editor_to: "/full", ...overrides,
  };
}

describe("QuestRunContainedTool", () => {
  beforeEach(() => {
    mocks.trigger.mockReset();
    mocks.npc.value = null;
  });

  const global = { stubs: { Teleport: true, EntityLightbox: { template: "<div><slot /></div>" } } };

  it("opens the authoritative encounter runner with an exact Run return path", () => {
    const wrapper = shallowMount(QuestRunContainedTool, {
      props: { attachment: attachment("encounter", { ref_id: "encounter-1" }), returnTo: "/quests/q1?mode=run&beat=b1" },
      global,
    });
    const run = wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Open full-screen");
    expect(run?.props("to")).toBe("/encounters/encounter-1/run?returnTo=%2Fquests%2Fq1%3Fmode%3Drun%26beat%3Db1");
  });

  it("shows only the rooms prepared for the beat", () => {
    const wrapper = shallowMount(QuestRunContainedTool, {
      props: { attachment: attachment("location_set", { ref_id: "root", metadata: { room_ids: ["room-1"] } }), returnTo: "/quests/q1?mode=run&beat=b1" },
      global,
    });
    expect(wrapper.text()).toContain("Crypt");
    expect(wrapper.text()).toContain("1 prepared room");
  });

  it("fires an attached sound through the shared playback subsystem", async () => {
    const wrapper = shallowMount(QuestRunContainedTool, {
      props: { attachment: attachment("sound", { ref_id: "sound-1" }), returnTo: "/quests/q1?mode=run&beat=b1" },
      global,
    });
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Play cue")!.trigger("click");
    expect(mocks.trigger).toHaveBeenCalledWith(expect.objectContaining({ id: "sound-1" }));
  });

  it("shows an entity quick view and closes back to the beat", async () => {
    mocks.npc.value = { name: "Mira", occupation: "Guide", status: "alive", personality: "Never wastes a word." };
    const wrapper = shallowMount(QuestRunContainedTool, {
      props: { attachment: attachment("npc", { ref_id: "npc-1", label: "Mira" }), returnTo: "/quests/q1?mode=run&beat=b1" },
      global,
    });
    expect(wrapper.text()).toContain("Guide · alive");
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Back to beat")!.trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
