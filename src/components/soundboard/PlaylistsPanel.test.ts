import { shallowMount } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import PlaylistsPanel from "./PlaylistsPanel.vue";

const canCreate = ref(true);

vi.mock("@/composables/soundboard/useSoundboardPlaylists", () => ({
  usePlaylists: () => ({ data: ref([]), isPending: ref(false) }),
  usePlaylistsTracks: () => ({ byPlaylist: ref(new Map()) }),
  useDeletePlaylist: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/composables/soundboard/useSounds", () => ({ useSounds: () => ({ data: ref([]) }) }));
vi.mock("@/stores/soundboard", () => ({ useSoundboardStore: () => ({}) }));
vi.mock("@/composables/billing/useQuota", () => ({ useQuota: () => ({ canCreate }) }));

function mountPanel(createPending: boolean) {
  return shallowMount(PlaylistsPanel, {
    props: { pageId: null, playlistType: "music", createPending },
  });
}

const editorOpen = (w: ReturnType<typeof mountPanel>) =>
  w.findComponent({ name: "PlaylistEditorDialog" }).props("open");

// The panel loads on demand (#999 5.2.1), so the page head's create can be asked
// for before the panel exists. The request is a flag, read when the panel mounts.
describe("PlaylistsPanel create request", () => {
  it("opens the editor when it mounts with a create already pending, and reports it handled", () => {
    canCreate.value = true;
    const wrapper = mountPanel(true);

    expect(editorOpen(wrapper)).toBe(true);
    expect(wrapper.emitted("create-handled")).toHaveLength(1);
  });

  it("does nothing on mount when no create is pending", () => {
    const wrapper = mountPanel(false);

    expect(editorOpen(wrapper)).toBe(false);
    expect(wrapper.emitted("create-handled")).toBeUndefined();
  });

  it("opens the editor when a create is asked for after it mounted", async () => {
    canCreate.value = true;
    const wrapper = mountPanel(false);

    await wrapper.setProps({ createPending: true });

    expect(editorOpen(wrapper)).toBe(true);
    expect(wrapper.emitted("create-handled")).toHaveLength(1);
  });
});
