import { describe, it, expect, beforeEach, vi } from "vitest";
import { effectScope, ref } from "vue";
import type { Sound, SoundboardPlaylist, PlaylistTrackWithSound } from "@/types/sound.types";

/**
 * The consumer's contract, not its plumbing. Two rules carry the whole feature:
 * a trigger that matches nothing must leave the board untouched, and a release
 * from anyone but the current owner must be ignored.
 */

const playlists = ref<SoundboardPlaylist[]>([]);
const sounds = ref<Sound[]>([]);
const tracks: PlaylistTrackWithSound[] = [
  { sound: { id: "s1", file_url: "https://example.test/1.mp3" } } as PlaylistTrackWithSound,
];

const store = {
  playPlaylist: vi.fn(),
  stopPlaylist: vi.fn(),
  stopAmbientPlaylist: vi.fn(),
  play: vi.fn(),
  stop: vi.fn(),
  activeMusicPlaylistId: vi.fn<() => string | null>(() => null),
  isPlaylistActive: vi.fn<(id: string) => boolean>(() => false),
};

vi.mock("@/stores/soundboard", () => ({ useSoundboardStore: () => store }));
vi.mock("@/composables/useSounds", () => ({ useSounds: () => ({ data: sounds }) }));
vi.mock("@/composables/useSoundboardPlaylists", () => ({
  usePlaylists: () => ({ data: playlists }),
  useFetchPlaylistTracks: () => () => Promise.resolve(tracks),
}));

function playlist(over: Partial<SoundboardPlaylist> & { id: string }): SoundboardPlaylist {
  return {
    campaign_id: "c", user_id: "u", page_id: null, name: over.id,
    playlist_type: "music", shuffle: false, repeat: true, sort_order: 0,
    tags: [], created_at: "", updated_at: "",
    ...over,
  } as SoundboardPlaylist;
}

/** Let the consumer's async track fetch settle. */
async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function mount() {
  const triggers = await import("@/lib/audioTriggers");
  const mod = await import("@/composables/useAudioThemeTriggers");
  mod.useAudioTriggerPrefs().setAudioTriggersEnabled(true);
  const scope = effectScope();
  scope.run(() => mod.useAudioThemeTriggers());
  return { ...triggers, scope, prefs: mod.useAudioTriggerPrefs };
}

beforeEach(async () => {
  vi.resetModules();
  Object.values(store).forEach((fn) => fn.mockClear());
  store.activeMusicPlaylistId.mockImplementation(() => null);
  store.isPlaylistActive.mockImplementation(() => false);
  playlists.value = [];
  sounds.value = [];
  const { clearAudioTriggerHandlers } = await import("@/lib/audioTriggers");
  clearAudioTriggerHandlers();
});

describe("a trigger that matches nothing", () => {
  it("leaves the board completely alone", async () => {
    const { requestAudioTheme } = await mount();
    playlists.value = [playlist({ id: "p", tags: ["calm"] })];

    requestAudioTheme({ sourceId: "encounter:1", theme: "battle", slot: "music", label: "Ambush" });
    await flush();

    // Silence the DM chose beats silence we chose — nothing is stopped either.
    expect(store.playPlaylist).not.toHaveBeenCalled();
    expect(store.stopPlaylist).not.toHaveBeenCalled();
    expect(store.play).not.toHaveBeenCalled();
  });

  it("does not stop the music that is already running", async () => {
    const { requestAudioTheme } = await mount();
    store.activeMusicPlaylistId.mockImplementation(() => "travel-music");

    requestAudioTheme({ sourceId: "encounter:1", theme: "battle", slot: "music", label: "Ambush" });
    await flush();

    expect(store.stopPlaylist).not.toHaveBeenCalled();
  });
});

describe("a trigger that matches", () => {
  it("plays the tagged playlist", async () => {
    const { requestAudioTheme } = await mount();
    const battle = playlist({ id: "battle", tags: ["battle"] });
    playlists.value = [battle];

    requestAudioTheme({ sourceId: "encounter:1", theme: "battle", slot: "music", label: "Ambush" });
    await flush();

    expect(store.playPlaylist).toHaveBeenCalledWith(battle, tracks);
  });

  it("does not restart what is already playing", async () => {
    const { requestAudioTheme } = await mount();
    playlists.value = [playlist({ id: "battle", tags: ["battle"] })];
    store.activeMusicPlaylistId.mockImplementation(() => "battle");

    requestAudioTheme({ sourceId: "encounter:1", theme: "battle", slot: "music", label: "Ambush" });
    await flush();

    // Restarting mid-bar would be worse than doing nothing.
    expect(store.playPlaylist).not.toHaveBeenCalled();
  });

  it("is ignored entirely when the DM has switched triggers off", async () => {
    const { requestAudioTheme, prefs } = await mount();
    playlists.value = [playlist({ id: "battle", tags: ["battle"] })];
    prefs().setAudioTriggersEnabled(false);

    requestAudioTheme({ sourceId: "encounter:1", theme: "battle", slot: "music", label: "Ambush" });
    await flush();

    expect(store.playPlaylist).not.toHaveBeenCalled();
    prefs().setAudioTriggersEnabled(true);
  });

  it("only touches its own slot", async () => {
    const { requestAudioTheme } = await mount();
    // An ambient scene shares the label, but a music request must not take it.
    playlists.value = [playlist({ id: "battle-scene", playlist_type: "ambient", tags: ["battle"] })];

    requestAudioTheme({ sourceId: "encounter:1", theme: "battle", slot: "music", label: "Ambush" });
    await flush();

    expect(store.playPlaylist).not.toHaveBeenCalled();
  });
});

describe("release", () => {
  it("hands the slot back to what was playing before", async () => {
    const { requestAudioTheme, releaseAudioTheme } = await mount();
    const battle = playlist({ id: "battle", tags: ["battle"] });
    const travel = playlist({ id: "travel" });
    playlists.value = [battle, travel];
    store.activeMusicPlaylistId.mockImplementation(() => "travel");

    requestAudioTheme({ sourceId: "encounter:1", theme: "battle", slot: "music", label: "Ambush" });
    await flush();

    releaseAudioTheme("encounter:1");
    await flush();

    expect(store.playPlaylist).toHaveBeenLastCalledWith(travel, tracks);
  });

  it("stops when nothing was playing before", async () => {
    const { requestAudioTheme, releaseAudioTheme } = await mount();
    playlists.value = [playlist({ id: "battle", tags: ["battle"] })];

    requestAudioTheme({ sourceId: "encounter:1", theme: "battle", slot: "music", label: "Ambush" });
    await flush();

    releaseAudioTheme("encounter:1");
    await flush();

    expect(store.stopPlaylist).toHaveBeenCalledWith("music");
  });

  it("ignores a release from anything but the current owner", async () => {
    const { requestAudioTheme, releaseAudioTheme } = await mount();
    playlists.value = [playlist({ id: "battle", tags: ["battle"] })];

    requestAudioTheme({ sourceId: "encounter:1", theme: "battle", slot: "music", label: "Ambush" });
    await flush();

    // A stale encounter ending must not cut the music a newer one started.
    releaseAudioTheme("encounter:0");
    await flush();

    expect(store.stopPlaylist).not.toHaveBeenCalled();
  });

  it("removes only the scene the released source started", async () => {
    const { requestAudioTheme, releaseAudioTheme } = await mount();
    const tavern = playlist({ id: "tavern", playlist_type: "ambient", tags: ["tavern"] });
    const dungeon = playlist({ id: "dungeon", playlist_type: "ambient", tags: ["dungeon"] });
    playlists.value = [tavern, dungeon];

    requestAudioTheme({ sourceId: "location:1", theme: "tavern", slot: "ambient", label: "Inn" });
    await flush();
    requestAudioTheme({ sourceId: "location:2", theme: "dungeon", slot: "ambient", label: "Crypt" });
    await flush();

    releaseAudioTheme("location:1");
    await flush();

    // Scoped by id: the crypt keeps running, and the blunt "stop the ambient
    // slot" call is never made.
    expect(store.stopAmbientPlaylist).toHaveBeenCalledWith("tavern");
    expect(store.stopAmbientPlaylist).not.toHaveBeenCalledWith("dungeon");
    expect(store.stopPlaylist).not.toHaveBeenCalled();
  });

  it("does not record its own audio as the thing to restore", async () => {
    const { requestAudioTheme, releaseAudioTheme } = await mount();
    playlists.value = [
      playlist({ id: "battle", tags: ["battle"] }),
      playlist({ id: "boss", tags: ["boss"] }),
    ];

    requestAudioTheme({ sourceId: "encounter:1", theme: "battle", slot: "music", label: "Ambush" });
    await flush();
    // Second trigger while we already own the slot — battle music is ours, so
    // it must not become the thing we restore afterwards.
    store.activeMusicPlaylistId.mockImplementation(() => "battle");
    requestAudioTheme({ sourceId: "encounter:1", theme: "boss", slot: "music", label: "Phase 2" });
    await flush();

    releaseAudioTheme("encounter:1");
    await flush();

    expect(store.stopPlaylist).toHaveBeenCalledWith("music");
  });
});

describe("scenes stack", () => {
  const tavern = () => playlist({ id: "tavern", playlist_type: "ambient", tags: ["tavern"] });
  const storm = () => playlist({ id: "storm", playlist_type: "ambient", tags: ["storm"] });

  it("adds a scene without displacing the one already running", async () => {
    const { requestAudioTheme } = await mount();
    playlists.value = [tavern(), storm()];

    requestAudioTheme({ sourceId: "location:1", theme: "tavern", slot: "ambient", label: "Inn" });
    await flush();
    requestAudioTheme({ sourceId: "weather:1", theme: "storm", slot: "ambient", label: "Storm" });
    await flush();

    // Rain over a tavern: two rooms at once is the feature, not a mistake.
    expect(store.playPlaylist).toHaveBeenCalledTimes(2);
    expect(store.stopPlaylist).not.toHaveBeenCalled();
    expect(store.stopAmbientPlaylist).not.toHaveBeenCalled();
  });

  it("ignores a repeat request from a source that already owns a scene", async () => {
    const { requestAudioTheme } = await mount();
    playlists.value = [tavern()];

    requestAudioTheme({ sourceId: "location:1", theme: "tavern", slot: "ambient", label: "Inn" });
    await flush();
    requestAudioTheme({ sourceId: "location:1", theme: "tavern", slot: "ambient", label: "Inn" });
    await flush();

    expect(store.playPlaylist).toHaveBeenCalledTimes(1);
  });

  it("never stops a scene when only the music slot is released", async () => {
    const { requestAudioTheme, releaseAudioTheme } = await mount();
    playlists.value = [tavern(), playlist({ id: "battle", tags: ["battle"] })];

    requestAudioTheme({ sourceId: "location:1", theme: "tavern", slot: "ambient", label: "Inn" });
    await flush();
    requestAudioTheme({ sourceId: "encounter:1", theme: "battle", slot: "music", label: "Ambush" });
    await flush();

    releaseAudioTheme("encounter:1");
    await flush();

    // Combat ending must leave the room the party is standing in alone.
    expect(store.stopPlaylist).toHaveBeenCalledWith("music");
    expect(store.stopAmbientPlaylist).not.toHaveBeenCalled();
  });
});
