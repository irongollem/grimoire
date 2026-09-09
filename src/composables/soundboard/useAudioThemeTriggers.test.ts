import { describe, it, expect, beforeEach, vi } from "vitest";
import { effectScope, reactive, ref } from "vue";
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

/** Reactive so a test can flip `isPlaying` and let `watchSoundEnd` react to it. */
const soundStates = new Map<string, { isPlaying: boolean }>();
function stateFor(soundId: string): { isPlaying: boolean } {
  if (!soundStates.has(soundId)) soundStates.set(soundId, reactive({ isPlaying: false }));
  return soundStates.get(soundId)!;
}

const store = {
  playPlaylist: vi.fn(),
  stopPlaylist: vi.fn(),
  stopAmbientPlaylist: vi.fn(),
  play: vi.fn(),
  stop: vi.fn(),
  activeMusicPlaylistId: vi.fn<() => string | null>(() => null),
  isPlaylistActive: vi.fn<(id: string) => boolean>(() => false),
  getState: vi.fn((soundId: string) => stateFor(soundId)),
};

/** Stands in for `useSoundTrigger()`'s returned function — a beat cue fires a
 * bare sound through this, exactly as any other playback button would. */
const fireSound = vi.fn((sound: { id: string }) => {
  stateFor(sound.id).isPlaying = true;
});

vi.mock("@/stores/soundboard", () => ({ useSoundboardStore: () => store }));
vi.mock("@/composables/soundboard/useSounds", () => ({ useSounds: () => ({ data: sounds }) }));
vi.mock("@/composables/soundboard/useSoundboardPlaylists", () => ({
  usePlaylists: () => ({ data: playlists }),
  useFetchPlaylistTracks: () => () => Promise.resolve(tracks),
}));
vi.mock("@/composables/soundboard/useSoundPlayback", () => ({ useSoundTrigger: () => fireSound }));

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
  const triggers = await import("@/lib/audio/audioTriggers");
  const mod = await import("@/composables/soundboard/useAudioThemeTriggers");
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
  soundStates.clear();
  fireSound.mockClear();
  const { clearAudioTriggerHandlers } = await import("@/lib/audio/audioTriggers");
  clearAudioTriggerHandlers();
});

describe("a trigger that matches nothing", () => {
  it("leaves the board completely alone", async () => {
    const { requestAudioTheme } = await mount();
    playlists.value = [playlist({ id: "p", tags: ["calm"] })];

    requestAudioTheme({ sourceId: "encounter:1", theme: "battle", slot: "music", label: "Ambush", kind: "encounter" });
    await flush();

    // Silence the DM chose beats silence we chose — nothing is stopped either.
    expect(store.playPlaylist).not.toHaveBeenCalled();
    expect(store.stopPlaylist).not.toHaveBeenCalled();
    expect(store.play).not.toHaveBeenCalled();
  });

  it("does not stop the music that is already running", async () => {
    const { requestAudioTheme } = await mount();
    store.activeMusicPlaylistId.mockImplementation(() => "travel-music");

    requestAudioTheme({ sourceId: "encounter:1", theme: "battle", slot: "music", label: "Ambush", kind: "encounter" });
    await flush();

    expect(store.stopPlaylist).not.toHaveBeenCalled();
  });
});

describe("a trigger that matches", () => {
  it("plays the tagged playlist", async () => {
    const { requestAudioTheme } = await mount();
    const battle = playlist({ id: "battle", tags: ["battle"] });
    playlists.value = [battle];

    requestAudioTheme({ sourceId: "encounter:1", theme: "battle", slot: "music", label: "Ambush", kind: "encounter" });
    await flush();

    expect(store.playPlaylist).toHaveBeenCalledWith(battle, tracks);
  });

  it("does not restart what is already playing", async () => {
    const { requestAudioTheme } = await mount();
    playlists.value = [playlist({ id: "battle", tags: ["battle"] })];
    store.activeMusicPlaylistId.mockImplementation(() => "battle");

    requestAudioTheme({ sourceId: "encounter:1", theme: "battle", slot: "music", label: "Ambush", kind: "encounter" });
    await flush();

    // Restarting mid-bar would be worse than doing nothing.
    expect(store.playPlaylist).not.toHaveBeenCalled();
  });

  it("is ignored entirely when the DM has switched triggers off", async () => {
    const { requestAudioTheme, prefs } = await mount();
    playlists.value = [playlist({ id: "battle", tags: ["battle"] })];
    prefs().setAudioTriggersEnabled(false);

    requestAudioTheme({ sourceId: "encounter:1", theme: "battle", slot: "music", label: "Ambush", kind: "encounter" });
    await flush();

    expect(store.playPlaylist).not.toHaveBeenCalled();
    prefs().setAudioTriggersEnabled(true);
  });

  it("only touches its own slot", async () => {
    const { requestAudioTheme } = await mount();
    // An ambient scene shares the label, but a music request must not take it.
    playlists.value = [playlist({ id: "battle-scene", playlist_type: "ambient", tags: ["battle"] })];

    requestAudioTheme({ sourceId: "encounter:1", theme: "battle", slot: "music", label: "Ambush", kind: "encounter" });
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

    requestAudioTheme({ sourceId: "encounter:1", theme: "battle", slot: "music", label: "Ambush", kind: "encounter" });
    await flush();

    releaseAudioTheme("encounter:1");
    await flush();

    expect(store.playPlaylist).toHaveBeenLastCalledWith(travel, tracks);
  });

  it("stops when nothing was playing before", async () => {
    const { requestAudioTheme, releaseAudioTheme } = await mount();
    playlists.value = [playlist({ id: "battle", tags: ["battle"] })];

    requestAudioTheme({ sourceId: "encounter:1", theme: "battle", slot: "music", label: "Ambush", kind: "encounter" });
    await flush();

    releaseAudioTheme("encounter:1");
    await flush();

    expect(store.stopPlaylist).toHaveBeenCalledWith("music");
  });

  it("ignores a release from anything but the current owner", async () => {
    const { requestAudioTheme, releaseAudioTheme } = await mount();
    playlists.value = [playlist({ id: "battle", tags: ["battle"] })];

    requestAudioTheme({ sourceId: "encounter:1", theme: "battle", slot: "music", label: "Ambush", kind: "encounter" });
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

    requestAudioTheme({ sourceId: "location:1", theme: "tavern", slot: "ambient", label: "Inn", kind: "location" });
    await flush();
    requestAudioTheme({ sourceId: "location:2", theme: "dungeon", slot: "ambient", label: "Crypt", kind: "location" });
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

    requestAudioTheme({ sourceId: "encounter:1", theme: "battle", slot: "music", label: "Ambush", kind: "encounter" });
    await flush();
    // Second trigger while we already own the slot — battle music is ours, so
    // it must not become the thing we restore afterwards.
    store.activeMusicPlaylistId.mockImplementation(() => "battle");
    requestAudioTheme({ sourceId: "encounter:1", theme: "boss", slot: "music", label: "Phase 2", kind: "encounter" });
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

    requestAudioTheme({ sourceId: "location:1", theme: "tavern", slot: "ambient", label: "Inn", kind: "location" });
    await flush();
    requestAudioTheme({ sourceId: "weather:1", theme: "storm", slot: "ambient", label: "Storm", kind: "location" });
    await flush();

    // Rain over a tavern: two rooms at once is the feature, not a mistake.
    expect(store.playPlaylist).toHaveBeenCalledTimes(2);
    expect(store.stopPlaylist).not.toHaveBeenCalled();
    expect(store.stopAmbientPlaylist).not.toHaveBeenCalled();
  });

  it("ignores a repeat request from a source that already owns a scene", async () => {
    const { requestAudioTheme } = await mount();
    playlists.value = [tavern()];

    requestAudioTheme({ sourceId: "location:1", theme: "tavern", slot: "ambient", label: "Inn", kind: "location" });
    await flush();
    requestAudioTheme({ sourceId: "location:1", theme: "tavern", slot: "ambient", label: "Inn", kind: "location" });
    await flush();

    expect(store.playPlaylist).toHaveBeenCalledTimes(1);
  });

  it("never stops a scene when only the music slot is released", async () => {
    const { requestAudioTheme, releaseAudioTheme } = await mount();
    playlists.value = [tavern(), playlist({ id: "battle", tags: ["battle"] })];

    requestAudioTheme({ sourceId: "location:1", theme: "tavern", slot: "ambient", label: "Inn", kind: "location" });
    await flush();
    requestAudioTheme({ sourceId: "encounter:1", theme: "battle", slot: "music", label: "Ambush", kind: "encounter" });
    await flush();

    releaseAudioTheme("encounter:1");
    await flush();

    // Combat ending must leave the room the party is standing in alone.
    expect(store.stopPlaylist).toHaveBeenCalledWith("music");
    expect(store.stopAmbientPlaylist).not.toHaveBeenCalled();
  });
});

/**
 * The label arrives on the request and used to be discarded the instant the
 * audio started, leaving a DM with music they could not explain. These cover
 * the snapshot that makes "why is this playing" answerable.
 */
describe("what the UI can read back", () => {
  const tavern = () => playlist({ id: "tavern", playlist_type: "ambient", tags: ["tavern"] });

  async function mountWithReader() {
    const mod = await import("@/composables/soundboard/useAudioThemeTriggers");
    const triggers = await mount();
    return { ...triggers, read: mod.useActiveAudioTriggers() };
  }

  it("keeps the label on the slot, not just on the event", async () => {
    const { requestAudioTheme, read } = await mountWithReader();
    playlists.value = [playlist({ id: "battle", tags: ["battle"] })];

    requestAudioTheme({ sourceId: "encounter:1", theme: "battle", slot: "music", label: "Goblin ambush", kind: "encounter" });
    await flush();

    expect(read.musicTrigger.value?.label).toBe("Goblin ambush");
    expect(read.musicTrigger.value?.kind).toBe("encounter");
    expect(read.triggerForPlaylist("battle")?.label).toBe("Goblin ambush");
  });

  it("finds the trigger for a scene by its playlist id", async () => {
    const { requestAudioTheme, read } = await mountWithReader();
    playlists.value = [tavern()];

    requestAudioTheme({ sourceId: "location:1", theme: "tavern", slot: "ambient", label: "The Rusty Anchor", kind: "location" });
    await flush();

    expect(read.triggerForPlaylist("tavern")?.label).toBe("The Rusty Anchor");
    expect(read.ambientTriggers.value).toHaveLength(1);
  });

  it("finds the trigger for a loose sound standing in for a scene", async () => {
    const { requestAudioTheme, read } = await mountWithReader();
    sounds.value = [
      { id: "s9", file_url: "u", category: "ambient", gain_trim: 1, tags: ["tavern"] } as Sound,
    ];

    requestAudioTheme({ sourceId: "location:1", theme: "tavern", slot: "ambient", label: "The Rusty Anchor", kind: "location" });
    await flush();

    expect(read.triggerForSound("s9")?.label).toBe("The Rusty Anchor");
  });

  it("reports nothing for audio the DM started themselves", async () => {
    // The chip must never appear on a scene nobody triggered — that would
    // claim a cause that does not exist.
    const { read } = await mountWithReader();
    expect(read.musicTrigger.value).toBeNull();
    expect(read.triggerForPlaylist("tavern")).toBeNull();
    expect(read.triggerForSound("s9")).toBeNull();
  });

  it("forgets the trigger once it is released", async () => {
    const { requestAudioTheme, releaseAudioTheme, read } = await mountWithReader();
    playlists.value = [tavern()];

    requestAudioTheme({ sourceId: "location:1", theme: "tavern", slot: "ambient", label: "The Rusty Anchor", kind: "location" });
    await flush();
    releaseAudioTheme("location:1");
    await flush();

    expect(read.ambientTriggers.value).toHaveLength(0);
    expect(read.triggerForPlaylist("tavern")).toBeNull();
  });

  it("keeps each scene's own trigger separate", async () => {
    const { requestAudioTheme, read } = await mountWithReader();
    playlists.value = [tavern(), playlist({ id: "storm", playlist_type: "ambient", tags: ["storm"] })];

    requestAudioTheme({ sourceId: "location:1", theme: "tavern", slot: "ambient", label: "The Rusty Anchor", kind: "location" });
    await flush();
    requestAudioTheme({ sourceId: "location:2", theme: "storm", slot: "ambient", label: "The Moors", kind: "location" });
    await flush();

    expect(read.triggerForPlaylist("tavern")?.label).toBe("The Rusty Anchor");
    expect(read.triggerForPlaylist("storm")?.label).toBe("The Moors");
  });
});

/**
 * Frame 14's ranking: a beat's cue is the loudest, deliberate intent in the
 * room and ducks everything else; a live encounter's theme is held rather
 * than stopped underneath it; the room is the floor. These cover the cue
 * request shape end to end — resolution-free, since a cue already names an
 * exact row — and the stack that makes "held" real.
 */
describe("a beat's audio cue", () => {
  const battle = () => playlist({ id: "battle", playlist_type: "music" });
  const scene = () => playlist({ id: "scene-1", playlist_type: "ambient" });

  it("takes the music slot and hands it back to what was playing before", async () => {
    const { requestAudioCue, releaseAudioTheme } = await mount();
    const travel = playlist({ id: "travel" });
    playlists.value = [battle(), travel];
    store.activeMusicPlaylistId.mockImplementation(() => "travel");

    requestAudioCue({ sourceId: "beat:b1:a1", kind: "beat", label: "Beat · The ambush", slot: "music", target: { playlistId: "battle" } });
    await flush();
    expect(store.playPlaylist).toHaveBeenCalledWith(expect.objectContaining({ id: "battle" }), tracks);

    releaseAudioTheme("beat:b1:a1");
    await flush();
    expect(store.playPlaylist).toHaveBeenLastCalledWith(travel, tracks);
  });

  it("joins the ambient stack like any other scene", async () => {
    const { requestAudioCue } = await mount();
    playlists.value = [scene()];

    requestAudioCue({ sourceId: "beat:b1:a1", kind: "beat", label: "Beat · Ambush", slot: "ambient", target: { playlistId: "scene-1" } });
    await flush();

    expect(store.playPlaylist).toHaveBeenCalledWith(expect.objectContaining({ id: "scene-1" }), tracks);
  });

  it("does nothing when the attachment's row no longer exists", async () => {
    const { requestAudioCue } = await mount();
    playlists.value = [];

    requestAudioCue({ sourceId: "beat:b1:a1", kind: "beat", label: "Beat · Gone", slot: "music", target: { playlistId: "missing" } });
    await flush();

    expect(store.playPlaylist).not.toHaveBeenCalled();
  });

  it("fires unconditionally, ignoring the DM's automatic-trigger toggle", async () => {
    const { requestAudioCue, prefs } = await mount();
    playlists.value = [battle()];
    prefs().setAudioTriggersEnabled(false);

    requestAudioCue({ sourceId: "beat:b1:a1", kind: "beat", label: "Beat · Ambush", slot: "music", target: { playlistId: "battle" } });
    await flush();

    // A cue is a button the DM pressed on purpose, not a guess the toggle
    // exists to suppress.
    expect(store.playPlaylist).toHaveBeenCalled();
    prefs().setAudioTriggersEnabled(true);
  });

  it("ducks a live encounter's theme and hands it back on release — held, not stopped", async () => {
    const { requestAudioTheme, requestAudioCue, releaseAudioTheme } = await mount();
    const boss = playlist({ id: "boss", playlist_type: "music", tags: ["boss"] });
    playlists.value = [battle(), boss];

    // The encounter's theme takes the slot first.
    requestAudioTheme({ sourceId: "encounter:1", theme: "boss", slot: "music", label: "Boss fight", kind: "encounter" });
    await flush();
    store.activeMusicPlaylistId.mockImplementation(() => "boss");
    expect(store.playPlaylist).toHaveBeenLastCalledWith(boss, tracks);

    // The DM fires a beat cue over it.
    requestAudioCue({ sourceId: "beat:b1:a1", kind: "beat", label: "Beat · Ambush", slot: "music", target: { playlistId: "battle" } });
    await flush();
    store.activeMusicPlaylistId.mockImplementation(() => "battle");
    expect(store.playPlaylist).toHaveBeenLastCalledWith(battle(), tracks);

    // Releasing the cue uncovers the encounter's theme rather than skipping
    // past it to whatever was playing before combat.
    releaseAudioTheme("beat:b1:a1");
    await flush();
    expect(store.playPlaylist).toHaveBeenLastCalledWith(boss, tracks);

    // The encounter's own release still works once it is back on top.
    releaseAudioTheme("encounter:1");
    await flush();
    expect(store.stopPlaylist).toHaveBeenCalledWith("music");
  });

  it("removes a held (non-top) release from the stack without touching playback", async () => {
    const { requestAudioTheme, requestAudioCue, releaseAudioTheme } = await mount();
    const boss = playlist({ id: "boss", playlist_type: "music", tags: ["boss"] });
    playlists.value = [battle(), boss];

    requestAudioTheme({ sourceId: "encounter:1", theme: "boss", slot: "music", label: "Boss fight", kind: "encounter" });
    await flush();
    store.activeMusicPlaylistId.mockImplementation(() => "boss");
    requestAudioCue({ sourceId: "beat:b1:a1", kind: "beat", label: "Beat · Ambush", slot: "music", target: { playlistId: "battle" } });
    await flush();
    store.playPlaylist.mockClear();

    // The encounter ends while the cue is still on top — it should vanish
    // quietly rather than restoring anything, since it was not audible.
    releaseAudioTheme("encounter:1");
    await flush();
    expect(store.playPlaylist).not.toHaveBeenCalled();
    expect(store.stopPlaylist).not.toHaveBeenCalled();

    // The cue's own release now has nothing held beneath it.
    releaseAudioTheme("beat:b1:a1");
    await flush();
    expect(store.stopPlaylist).toHaveBeenCalledWith("music");
  });

  describe("a bare-sound cue", () => {
    const cueSound = { id: "s9", file_url: "u", category: "effects", source_type: "url", gain_trim: 1, tags: [] } as unknown as Sound;

    it("fires through the existing playback path and is visible to the UI", async () => {
      const mod = await import("@/composables/soundboard/useAudioThemeTriggers");
      const { requestAudioCue } = await mount();
      const read = mod.useActiveAudioTriggers();
      sounds.value = [cueSound];

      requestAudioCue({ sourceId: "beat:b1:a2", kind: "beat", label: "Beat · Thunder", slot: "ambient", target: { soundId: "s9" } });
      await flush();

      expect(fireSound).toHaveBeenCalledWith(cueSound);
      expect(read.triggerForSound("s9")?.label).toBe("Beat · Thunder");
    });

    it("never contests the exclusive music slot", async () => {
      const { requestAudioCue } = await mount();
      sounds.value = [cueSound];

      requestAudioCue({ sourceId: "beat:b1:a2", kind: "beat", label: "Beat · Thunder", slot: "ambient", target: { soundId: "s9" } });
      await flush();

      expect(store.stopPlaylist).not.toHaveBeenCalled();
    });

    it("releases itself once the sound goes quiet, without an explicit release", async () => {
      const mod = await import("@/composables/soundboard/useAudioThemeTriggers");
      const { requestAudioCue } = await mount();
      const read = mod.useActiveAudioTriggers();
      sounds.value = [cueSound];

      requestAudioCue({ sourceId: "beat:b1:a2", kind: "beat", label: "Beat · Thunder", slot: "ambient", target: { soundId: "s9" } });
      await flush();
      expect(read.triggerForSound("s9")).not.toBeNull();

      stateFor("s9").isPlaying = false;
      await flush();

      expect(read.triggerForSound("s9")).toBeNull();
    });

    it("does nothing when the attachment's sound row no longer exists", async () => {
      const { requestAudioCue } = await mount();
      sounds.value = [];

      requestAudioCue({ sourceId: "beat:b1:a2", kind: "beat", label: "Beat · Gone", slot: "ambient", target: { soundId: "missing" } });
      await flush();

      expect(fireSound).not.toHaveBeenCalled();
    });
  });
});
