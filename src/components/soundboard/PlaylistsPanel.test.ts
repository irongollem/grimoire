import { shallowMount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Sound, SoundboardPlaylist } from "@/types/sound.types";
import PlaylistsPanel from "./PlaylistsPanel.vue";

const canCreate = ref(true);
const sounds = ref<Sound[]>([]);
const playlistRows = ref<SoundboardPlaylist[]>([]);
const deleteSound = vi.fn();
const spotify = { isPlaying: false, lastPlayedUrl: null as string | null, pause: vi.fn() };

vi.mock("@/composables/soundboard/useSoundboardPlaylists", () => ({
  usePlaylists: () => ({ data: playlistRows, isPending: ref(false) }),
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

function mountPanel(createPending: boolean, extra: { pageId?: string | null; playlistType?: "music" | "ambient"; filter?: string } = {}) {
  return shallowMount(PlaylistsPanel, {
    props: { pageId: null, playlistType: "music", createPending, ...extra },
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
  const playlist = {
    id: "sound-1",
    source_type: "spotify",
    page_id: null,
    file_url: "https://open.spotify.com/playlist/abc123",
  } as Sound;

  beforeEach(() => {
    sounds.value = [playlist];
    deleteSound.mockClear();
    spotify.pause.mockClear();
  });

  it("deletes the sound when its card asks to", () => {
    spotify.isPlaying = false;
    const wrapper = mountPanel(false);

    wrapper.findComponent({ name: "SoundCard" }).vm.$emit("delete", playlist);

    expect(deleteSound).toHaveBeenCalledWith(playlist);
    expect(spotify.pause).not.toHaveBeenCalled();
  });

  it("stops it first when it is the one playing", () => {
    spotify.isPlaying = true;
    spotify.lastPlayedUrl = playlist.file_url;
    const wrapper = mountPanel(false);

    wrapper.findComponent({ name: "SoundCard" }).vm.$emit("delete", playlist);

    expect(spotify.pause).toHaveBeenCalled();
    expect(deleteSound).toHaveBeenCalledWith(playlist);
  });
});

// A single Spotify track is a sound and sits on the board; only playlists and
// albums are listed here.
describe("PlaylistsPanel From Spotify", () => {
  it("lists playlists and albums but not single tracks", () => {
    sounds.value = [
      { id: "p", source_type: "spotify", page_id: null, file_url: "https://open.spotify.com/playlist/p1" },
      { id: "a", source_type: "spotify", page_id: null, file_url: "https://open.spotify.com/album/a1" },
      { id: "t", source_type: "spotify", page_id: null, file_url: "https://open.spotify.com/track/t1" },
    ] as Sound[];
    const wrapper = mountPanel(false);

    const shown = wrapper.findAllComponents({ name: "SoundCard" }).map((c) => (c.props("sound") as Sound).id);
    expect(shown).toEqual(["p", "a"]);
  });
});

describe("PlaylistsPanel what is listed", () => {
  const pl = (id: string, over: Partial<SoundboardPlaylist>) =>
    ({ id, name: id, tags: [], playlist_type: "music", page_id: null, ...over }) as SoundboardPlaylist;
  const shown = (w: ReturnType<typeof mountPanel>) => w.findAllComponents({ name: "PlaylistCard" }).map((c) => (c.props("playlist") as SoundboardPlaylist).id);

  beforeEach(() => {
    sounds.value = [];
    playlistRows.value = [
      pl("Battle themes", { tags: ["combat"] }),
      pl("Tavern", { page_id: "ch1" }),
      pl("Crypt", { page_id: "ch2" }),
      pl("Rain", { playlist_type: "ambient" }),
    ];
  });

  it("lists only this peer's playlists: music here, scenes in the ambient panel", () => {
    expect(shown(mountPanel(false))).toEqual(["Battle themes", "Tavern", "Crypt"]);
    expect(shown(mountPanel(false, { playlistType: "ambient" }))).toEqual(["Rain"]);
  });

  it("on a page shows that page's playlists and the unpaged ones, not another page's", () => {
    expect(shown(mountPanel(false, { pageId: "ch1" }))).toEqual(["Battle themes", "Tavern"]);
  });

  it("filters by name or tag, ignoring case and surrounding spaces", () => {
    expect(shown(mountPanel(false, { filter: "  TAVERN " }))).toEqual(["Tavern"]);
    expect(shown(mountPanel(false, { filter: "combat" }))).toEqual(["Battle themes"]);
  });

  it("opens the paywall, not the editor, when the playlist quota is spent", async () => {
    canCreate.value = false;
    const w = mountPanel(true);
    expect(editorOpen(w)).toBe(false);
    expect(w.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
    canCreate.value = true;
  });

  it("lists a Spotify collection from another page only when no page is chosen", () => {
    sounds.value = [
      { id: "mine", source_type: "spotify", page_id: "ch1", file_url: "https://open.spotify.com/playlist/p1" },
      { id: "other", source_type: "spotify", page_id: "ch2", file_url: "https://open.spotify.com/playlist/p2" },
    ] as Sound[];
    const ids = (w: ReturnType<typeof mountPanel>) => w.findAllComponents({ name: "SoundCard" }).map((c) => (c.props("sound") as Sound).id);
    expect(ids(mountPanel(false, { pageId: "ch1" }))).toEqual(["mine"]);
    expect(ids(mountPanel(false))).toEqual(["mine", "other"]);
  });
});
