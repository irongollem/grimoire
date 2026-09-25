import { describe, it, expect, beforeEach, vi } from "vitest";
import { ref } from "vue";
import type { Sound, SoundboardPlaylist } from "@/types/sound.types";
import type { ActiveTrigger } from "@/composables/soundboard/useAudioThemeTriggers";

const mocks = vi.hoisted(() => ({ requestAudioCue: vi.fn(), releaseAudioTheme: vi.fn() }));

const ambientTriggers = ref<ActiveTrigger[]>([]);
const playlists = ref<SoundboardPlaylist[] | undefined>([]);
const sounds = ref<Sound[] | undefined>([]);

vi.mock("@/lib/audio/audioTriggers", () => ({
  requestAudioCue: mocks.requestAudioCue,
  releaseAudioTheme: mocks.releaseAudioTheme,
}));
vi.mock("@/composables/soundboard/useAudioThemeTriggers", () => ({
  useActiveAudioTriggers: () => ({ ambientTriggers }),
}));
vi.mock("@/composables/soundboard/useSoundboardPlaylists", () => ({ usePlaylists: () => ({ data: playlists }) }));
vi.mock("@/composables/soundboard/useSounds", () => ({ useSounds: () => ({ data: sounds }) }));

import { useAmbiencePlayback } from "./useAmbiencePlayback";

function scene(id: string, tag: string): SoundboardPlaylist {
  return {
    id, campaign_id: "c", user_id: "u", page_id: null, name: id,
    playlist_type: "ambient", shuffle: false, repeat: true, sort_order: 0,
    tags: [tag], created_at: "", updated_at: "",
  } as SoundboardPlaylist;
}

/** What the bus records once a cue from `sourceId` has started. */
function owning(sourceId: string, target: string): ActiveTrigger {
  return { sourceId, label: "", kind: "location", slot: "ambient", target };
}

beforeEach(() => {
  mocks.requestAudioCue.mockClear();
  mocks.releaseAudioTheme.mockClear();
  ambientTriggers.value = [];
  playlists.value = [scene("tavern-scene", "tavern"), scene("crypt-scene", "crypt")];
  sounds.value = [];
});

describe("useAmbiencePlayback", () => {
  // A cue, not a theme request: the DM pressed Play on purpose, so the
  // automatic-triggers switch has no say over it.
  it("plays a place's theme as a cue for the scene that answers it", () => {
    useAmbiencePlayback().play({ themeOwnerId: "inn", theme: "tavern", label: "The Inn" });

    expect(mocks.requestAudioCue).toHaveBeenCalledWith({
      sourceId: "ambience:inn", slot: "ambient", label: "The Inn", kind: "location",
      target: { playlistId: "tavern-scene" },
    });
    expect(mocks.releaseAudioTheme).not.toHaveBeenCalled();
  });

  it("replaces the place already playing rather than layering a second one", () => {
    ambientTriggers.value = [owning("ambience:inn", "tavern-scene")];

    useAmbiencePlayback().play({ themeOwnerId: "crypt", theme: "crypt", label: "The Crypt" });

    // Start first, release second, so the change never drops to silence.
    expect(mocks.requestAudioCue.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.releaseAudioTheme.mock.invocationCallOrder[0]);
    expect(mocks.releaseAudioTheme).toHaveBeenCalledWith("ambience:inn");
  });

  it("leaves the party's own ambience alone", () => {
    ambientTriggers.value = [owning("location:inn", "tavern-scene")];
    const playback = useAmbiencePlayback();

    playback.stop();

    expect(mocks.releaseAudioTheme).not.toHaveBeenCalled();
    expect(playback.isPlaying("inn")).toBe(false);
  });

  it("stops what it started", () => {
    ambientTriggers.value = [owning("ambience:inn", "tavern-scene")];
    const playback = useAmbiencePlayback();
    expect(playback.isPlaying("inn")).toBe(true);

    playback.stop();

    expect(mocks.releaseAudioTheme).toHaveBeenCalledWith("ambience:inn");
  });

  it("has nothing to play while the soundboard is loading or has no scene for the theme", () => {
    const playback = useAmbiencePlayback();
    expect(playback.targetFor("storm")).toBeNull();

    playlists.value = undefined;
    expect(playback.targetFor("tavern")).toBeNull();
    playback.play({ themeOwnerId: "inn", theme: "tavern", label: "The Inn" });
    expect(mocks.requestAudioCue).not.toHaveBeenCalled();
  });
});
