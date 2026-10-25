import { shallowMount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Sound } from "@/types/sound.types";
import PlaylistsPanel from "./PlaylistsPanel.vue";

const canCreate = ref(true);
const sounds = ref<Sound[]>([]);
const deleteSound = vi.fn();
const spotify = { isPlaying: false, lastPlayedUrl: null as string | null, pause: vi.fn() };

vi.mock("@/composables/soundboard/useSoundboardPlaylists", () => ({
  usePlaylists: () => ({ data: ref([]), isPending: ref(false) }),
  usePlaylistsTracks: () => ({ byPlaylist: ref(new Map()) }),
  useDeletePlaylist: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/composables/soundboard/useSounds", () => ({
  useSounds: () => ({ data: sounds }),
  useDeleteSound: () => ({ mutate: deleteSound }),
}));
vi.mock("@/stores/soundboard", () => ({ useSoundboardStore: () => ({}) }));
vi.mock("@/stores/spotify", () => ({ useSpotifyStore: () => spotify }));
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

// The "From Spotify" cards show a delete button that nothing listened to (#1098).
describe("PlaylistsPanel Spotify delete", () => {
  const track = {
    id: "sound-1",
    source_type: "spotify",
    page_id: null,
    file_url: "https://open.spotify.com/track/abc123",
  } as Sound;

  beforeEach(() => {
    sounds.value = [track];
    deleteSound.mockClear();
    spotify.pause.mockClear();
  });

  it("deletes the sound when its card asks to", () => {
    spotify.isPlaying = false;
    const wrapper = mountPanel(false);

    wrapper.findComponent({ name: "SoundCard" }).vm.$emit("delete", track);

    expect(deleteSound).toHaveBeenCalledWith(track);
    expect(spotify.pause).not.toHaveBeenCalled();
  });

  it("stops the track first when it is the one playing", () => {
    spotify.isPlaying = true;
    spotify.lastPlayedUrl = track.file_url;
    const wrapper = mountPanel(false);

    wrapper.findComponent({ name: "SoundCard" }).vm.$emit("delete", track);

    expect(spotify.pause).toHaveBeenCalled();
    expect(deleteSound).toHaveBeenCalledWith(track);
  });
});
