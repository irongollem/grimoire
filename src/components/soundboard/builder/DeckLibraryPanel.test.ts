import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Sound } from "@/types/sound.types";
import DeckLibraryPanel from "./DeckLibraryPanel.vue";
import { useSoundboardUiStore } from "@/stores/ui/soundboard";

const sounds = ref<Sound[]>([]);

vi.mock("@/composables/soundboard/useSounds", () => ({ useSounds: () => ({ data: sounds }) }));
vi.mock("@/composables/soundboard/useSoundboardPlaylists", () => ({
  usePlaylists: () => ({ data: ref([]) }),
  usePlaylistsTracks: () => ({ byPlaylist: ref(new Map()) }),
  useFetchPlaylistTracks: () => vi.fn(),
}));
vi.mock("@/composables/soundboard/useSoundPlayback", () => ({
  useAudibleCheck: () => () => false,
  useSoundToggle: () => vi.fn(),
}));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate: ref(true) }) }));
vi.mock("@/stores/soundboard", () => ({ useSoundboardStore: () => ({ isPlaylistActive: () => false }) }));

function sound(id: string, name: string, over: Partial<Sound> = {}): Sound {
  return {
    id, user_id: "u", campaign_id: "c", page_id: null, name, category: "effects", source_type: "upload",
    file_url: "https://example.test/a.mp3", storage_path: null, library_id: null, tags: [], sort_order: 0,
    attribution: null, attribution_url: null, thumbnail_url: null, artist: null, gain_trim: 1,
    created_at: "", updated_at: "", ...over,
  };
}

function mountPanel(canPlace: boolean) {
  return mount(DeckLibraryPanel, {
    props: { usedSoundIds: new Set(["a"]), usedPlaylistIds: new Set<string>(), canPlace },
    global: { stubs: { PlaylistEditorDialog: true, PaywallModal: true, StarterScenesCard: true } },
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  sounds.value = [sound("a", "Door slam"), sound("b", "Thunder", { category: "ambient" })];
});

describe("DeckLibraryPanel", () => {
  it("places on click only when an empty slot is selected", async () => {
    // Bug: a click with no slot selected would emit a place with nowhere to put it.
    const off = mountPanel(false);
    await off.find("li").trigger("click");
    expect(off.emitted("place")).toBeUndefined();

    const on = mountPanel(true);
    await on.find("li").trigger("click");
    expect(on.emitted("place")).toEqual([[{ kind: "sound", id: "a" }]]);
  });

  it("marks what is already on the page", () => {
    expect(mountPanel(false).findAll("li")[0]?.text()).toContain("on this page");
    expect(mountPanel(false).findAll("li")[1]?.text()).not.toContain("on this page");
  });

  it("drags a sound with the sound drag type", async () => {
    const setData = vi.fn();
    await mountPanel(false).find("li").trigger("dragstart", { dataTransfer: { setData, effectAllowed: "" } });
    expect(setData).toHaveBeenCalledWith("application/x-grimoire-sound", "a");
  });

  it("filters the list by the shared search query and category", async () => {
    const w = mountPanel(false);
    const ui = useSoundboardUiStore();
    ui.soundboardSearchQuery = "thun";
    await w.vm.$nextTick();
    expect(w.findAll("li")).toHaveLength(1);
    expect(w.text()).toContain("Thunder");
    ui.resetSoundboardFilters();
    ui.soundboardFilterCategory = "effects";
    await w.vm.$nextTick();
    expect(w.text()).toContain("Door slam");
    expect(w.text()).not.toContain("Thunder");
  });
});
