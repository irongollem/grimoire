// @vitest-environment happy-dom
import { effectScope, nextTick, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: string; name: string; parent_id: string | null; audio_theme: string | null; book_nook_id: string | null };

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  play: vi.fn(),
  stop: vi.fn(),
  answered: new Set<string>(),
  playingOwner: null as string | null,
}));
const locations = ref<Row[] | undefined>(undefined);
const playlists = ref<{ tags: string[] }[] | undefined>([]);
const sounds = ref<{ tags: string[] }[] | undefined>([]);

vi.mock("@/composables/locations/useLocations", () => ({
  useAllLocations: () => ({ data: locations }),
  useUpdateLocation: () => ({ mutateAsync: mocks.update }),
}));
vi.mock("@/composables/soundboard/useSoundboardPlaylists", () => ({ usePlaylists: () => ({ data: playlists }) }));
vi.mock("@/composables/soundboard/useSounds", () => ({ useSounds: () => ({ data: sounds }) }));
vi.mock("@/composables/locations/useAmbiencePlayback", () => ({
  useAmbiencePlayback: () => ({
    targetFor: (theme: string) => (mocks.answered.has(theme) ? { playlistId: `p-${theme}` } : null),
    isPlaying: (owner: string) => mocks.playingOwner === owner,
    play: mocks.play,
    stop: mocks.stop,
  }),
}));

import { useNookPlaceSound } from "./useNookPlaceSound";

const town: Row = { id: "town", name: "Sugarwell", parent_id: null, audio_theme: "tavern", book_nook_id: null };
const inn: Row = { id: "inn", name: "The Pulled Sugar Inn", parent_id: "town", audio_theme: null, book_nook_id: "n1" };
const cellar: Row = { id: "cellar", name: "Cellar", parent_id: "inn", audio_theme: null, book_nook_id: null };

beforeEach(() => {
  mocks.update.mockReset().mockResolvedValue({});
  mocks.play.mockReset();
  mocks.stop.mockReset();
  mocks.answered = new Set(["tavern"]);
  mocks.playingOwner = null;
  locations.value = [town, { ...inn }, cellar];
  playlists.value = [];
  sounds.value = [];
});

function mountSound(nookId = "n1") {
  const scope = effectScope();
  const sound = scope.run(() => useNookPlaceSound(() => nookId))!;
  return { sound, scope };
}

describe("a nook's sound is its place's ambience", () => {
  it("saves a typed theme, trimmed, on the place that shows the nook, and a cleared one as null", async () => {
    // Bug: a "" theme, which resolveInheritedTheme reads as blank but the column keeps, or a write to the wrong place.
    const { sound, scope } = mountSound();
    sound.draft.theme = "  storm ";
    await nextTick();
    await sound.saveNow();
    expect(mocks.update).toHaveBeenLastCalledWith({ id: "inn", update: { audio_theme: "storm" } });
    sound.draft.theme = "   ";
    await nextTick();
    await sound.saveNow();
    expect(mocks.update).toHaveBeenLastCalledWith({ id: "inn", update: { audio_theme: null } });
    scope.stop();
  });

  it("saves an edit on the place it was typed for, even if the nook moves to another place before it lands", async () => {
    // Bug: the save read the current place, so a theme typed for the inn was written onto the cellar.
    const { sound, scope } = mountSound();
    sound.draft.theme = "storm";
    await nextTick();
    locations.value = [town, { ...inn, book_nook_id: null }, { ...cellar, book_nook_id: "n1" }];
    await nextTick();
    await sound.saveNow();
    expect(mocks.update).toHaveBeenLastCalledWith({ id: "inn", update: { audio_theme: "storm" } });
    scope.stop();
  });

  it("a themeless place says in the field what it inherits", () => {
    // Bug: an empty field read as "no sound" while the inn in fact plays Sugarwell's tavern.
    const { sound, scope } = mountSound();
    expect(sound.placeholder.value).toBe("tavern (from Sugarwell)");
    scope.stop();
  });

  it("Play plays the inherited theme, owned by the place it comes from", () => {
    // Bug: owning it as the inn put a second owner on the scene usePartyAmbience already holds as Sugarwell's.
    const { sound, scope } = mountSound();
    expect(sound.playable.value).toBe(true);
    sound.toggle();
    expect(mocks.play).toHaveBeenCalledWith({ themeOwnerId: "town", theme: "tavern", label: "The Pulled Sugar Inn" });
    scope.stop();
  });

  it("pressing it while the place's sound plays stops it, rather than starting it again", () => {
    // Bug: the button showed Stop but pressing it re-sent the cue, so the ambience never stopped.
    mocks.playingOwner = "town";
    const { sound, scope } = mountSound();
    expect(sound.playing.value).toBe(true);
    sound.toggle();
    expect(mocks.stop).toHaveBeenCalledOnce();
    expect(mocks.play).not.toHaveBeenCalled();
    scope.stop();
  });

  it("a theme no scene answers has no Play, and says why", () => {
    // Bug: a Play button that does nothing, or silence with no explanation.
    const { sound, scope } = mountSound();
    sound.draft.theme = "storm";
    expect(sound.playable.value).toBe(false);
    expect(sound.unanswered.value).toBe("storm");
    scope.stop();
  });

  it("a nook shown at no place has no sound, and saves nothing", async () => {
    const { sound, scope } = mountSound("n-elsewhere");
    expect(sound.place.value).toBeNull();
    sound.draft.theme = "storm";
    await nextTick();
    await sound.saveNow();
    expect(mocks.update).not.toHaveBeenCalled();
    scope.stop();
  });

  it("a theme changed elsewhere refreshes the field, but never over an edit in progress", async () => {
    // Bug: the place's own form changed the theme and the studio kept showing (and later saving back) the old one.
    const { sound, scope } = mountSound();
    locations.value = [town, { ...inn, audio_theme: "hearth" }, cellar];
    await nextTick();
    expect(sound.draft.theme).toBe("hearth");
    sound.draft.theme = "storm";
    await nextTick();
    locations.value = [town, { ...inn, audio_theme: "rain" }, cellar];
    await nextTick();
    expect(sound.draft.theme).toBe("storm");
    scope.stop();
  });
});
