import { shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestRunContainedTool from "./QuestRunContainedTool.vue";
import type { QuestBeatAttachmentSummary, QuestBeatAttachmentType } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  locations: { value: [
    { id: "root", name: "Drowned Abbey", location_type: "dungeon", description: "root-body", notes: "Mind the tide.", parent_id: null },
    { id: "room-1", name: "Crypt", location_type: "room", description: "room-body", notes: null, parent_id: "root" },
  ] },
  sounds: { value: [{ id: "sound-1", name: "Thunder", category: "effects", source_type: "url", file_url: "thunder.mp3", storage_path: null }] },
  playlists: { value: [] },
  tracks: { value: [] },
  npc: { value: null as Record<string, unknown> | null },
  faction: { value: null as Record<string, unknown> | null },
  monster: { value: undefined as { monster: Record<string, unknown>; isShared: boolean } | undefined },
  note: { value: undefined as Record<string, unknown> | undefined },
  handout: { value: undefined as Record<string, unknown> | undefined },
  soundEnabled: null as (() => boolean) | null,
  playlistEnabled: null as (() => boolean) | null,
  objectiveQuestId: { value: "" },
  monsterId: { value: "" },
  noteId: { value: "" },
  handoutId: { value: "" },
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
vi.mock("@/composables/useMonsters", () => ({ useResolvedMonster: (id: { value: string }) => {
  mocks.monsterId = id;
  return { data: mocks.monster };
} }));
vi.mock("@/composables/useNotes", () => ({ useNote: (id: { value: string }) => {
  mocks.noteId = id;
  return { data: mocks.note, isLoading: { value: false } };
} }));
vi.mock("@/composables/useScriptorium", () => ({ useScriptoriumDocument: (id: { value: string }) => {
  mocks.handoutId = id;
  return { data: mocks.handout, isLoading: { value: false } };
} }));
vi.mock("@/composables/useSounds", () => ({ useSounds: (enabled: () => boolean) => {
  mocks.soundEnabled = enabled;
  return { data: mocks.sounds };
} }));
vi.mock("@/composables/useSoundboardPlaylists", () => ({
  usePlaylists: (enabled: () => boolean) => {
    mocks.playlistEnabled = enabled;
    return { data: mocks.playlists };
  },
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
  useQuestObjectives: (questId: { value: string }) => {
    mocks.objectiveQuestId = questId;
    return { data: { value: [] } };
  },
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
    mocks.note.value = undefined;
    mocks.handout.value = undefined;
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
    expect(wrapper.text()).toContain("Mind the tide.");
    const bodies = wrapper.findAllComponents({ name: "RichTextViewer" }).map((viewer) => viewer.props("content"));
    expect(bodies).toEqual(["root-body", "room-body"]);
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

  it("renders an attached note body and gates unrelated queries", () => {
    mocks.note.value = { title: "Bell lore", category: "lore", tags: ["bell"], content: "note-body" };
    const wrapper = shallowMount(QuestRunContainedTool, {
      props: { attachment: attachment("note", { ref_id: "note-1" }), returnTo: "/quests/q1?mode=run&beat=b1" },
      global,
    });
    expect(wrapper.findComponent({ name: "RichTextViewer" }).props("content")).toBe("note-body");
    expect(wrapper.text()).toContain("lore · bell");
    expect(mocks.noteId.value).toBe("note-1");
    expect(mocks.handoutId.value).toBe("");
    expect(mocks.monsterId.value).toBe("");
    expect(mocks.objectiveQuestId.value).toBe("");
    expect(mocks.soundEnabled?.()).toBe(false);
    expect(mocks.playlistEnabled?.()).toBe(false);
  });

  it("renders an attached Scriptorium handout body", () => {
    mocks.handout.value = { title: "The prophecy", doc_type: "handout", word_count: 42, is_published: false, content: "handout-body" };
    const wrapper = shallowMount(QuestRunContainedTool, {
      props: { attachment: attachment("handout", { ref_id: "handout-1" }), returnTo: "/quests/q1?mode=run&beat=b1" },
      global,
    });
    expect(wrapper.findComponent({ name: "RichTextViewer" }).props("content")).toBe("handout-body");
    expect(wrapper.text()).toContain("handout · 42 words · draft");
    expect(mocks.handoutId.value).toBe("handout-1");
    expect(mocks.noteId.value).toBe("");
  });
});
