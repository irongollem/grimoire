import { computed, reactive, watch } from "vue";
import { useAutosave } from "@/composables/useAutosave";
import { useAmbiencePlayback } from "@/composables/locations/useAmbiencePlayback";
import { useAllLocations, useUpdateLocation } from "@/composables/locations/useLocations";
import { usePlaylists } from "@/composables/soundboard/useSoundboardPlaylists";
import { useSounds } from "@/composables/soundboard/useSounds";
import { collectThemes } from "@/lib/audio/audioThemes";
import { resolveInheritedTheme, type AmbienceLocationLike } from "@/lib/locations/ambience";

/**
 * A nook's sound, which is its place's ambience (#1142 decision 13). A nook has no sound of its own: it is shown
 * at one place, and a second copy of that place's sound would drift from it. So the studio's Sound row edits the
 * place's own `audio_theme`, the same field as the place's Details form, and plays it by hand through
 * `useAmbiencePlayback` exactly as the Atlas pane's Play does. Nothing plays when the studio opens.
 *
 * A nook shown at no place has no sound row (`place` is null).
 */

interface SoundDraft {
  /** The place the edit is for. Kept in the draft so a save lands on the place it was typed for. */
  placeId: string | null;
  theme: string | null;
}

/** Blank means "ask my parent", which the column says as null (as `LocationEditor` writes it). */
function normalTheme(theme: string | null): string | null {
  return theme === null || theme.trim() === "" ? null : theme.trim();
}

export function useNookPlaceSound(nookId: () => string) {
  const { data: locations } = useAllLocations();
  const { mutateAsync: update } = useUpdateLocation();
  const { data: playlists } = usePlaylists();
  const { data: sounds } = useSounds();
  const ambience = useAmbiencePlayback();

  const place = computed(() => locations.value?.find((l) => l.book_nook_id === nookId()) ?? null);

  const fromPlace = (): SoundDraft => ({ placeId: place.value?.id ?? null, theme: place.value?.audio_theme ?? null });
  const draft = reactive<SoundDraft>(fromPlace());
  const sameDraft = (a: SoundDraft, b: SoundDraft) => a.placeId === b.placeId && normalTheme(a.theme) === normalTheme(b.theme);

  const autosave = useAutosave({
    draft,
    initial: fromPlace,
    equal: sameDraft,
    canSave: () => draft.placeId !== null,
    async save(snapshot) {
      if (snapshot.placeId === null) return;
      await update({ id: snapshot.placeId, update: { audio_theme: normalTheme(snapshot.theme) } });
    },
    errorMessage: "Could not save the location's sound",
  });

  // The place arrives, the nook moves to another place, or the theme was changed elsewhere (the place's form,
  // another tab). Our own save's echo compares equal and changes nothing; an edit in progress is never replaced.
  watch(
    () => [place.value?.id, place.value?.audio_theme] as const,
    () => {
      if (autosave.dirty.value || autosave.saving.value) return;
      const incoming = fromPlace();
      if (sameDraft(incoming, draft)) return;
      autosave.reset(incoming);
    },
  );

  /** What the place sounds like with the theme as typed: its own, or the nearest themed parent's. */
  const resolved = computed(() => {
    const here = place.value;
    const all = locations.value;
    if (!here || all === undefined) return null;
    const byId = new Map<string, AmbienceLocationLike>(all.map((l) => [l.id, l]));
    byId.set(here.id, { ...here, audio_theme: normalTheme(draft.theme) });
    return resolveInheritedTheme(here.id, byId);
  });

  /** A themeless place says what it inherits, in the field itself. */
  const placeholder = computed(() => {
    const r = resolved.value;
    if (r?.kind === "inherited" && r.theme && r.from) return `${r.theme} (from ${r.from.name})`;
    if (r?.kind === "silence-inherited" && r.from) return `silence (from ${r.from.name})`;
    return "tavern, storm…";
  });

  const soundboardLoaded = computed(() => playlists.value !== undefined && sounds.value !== undefined);
  // Still loading is a real state: no suggestions until both lists land (as the place's Details form does).
  const themes = computed(() =>
    playlists.value === undefined || sounds.value === undefined ? [] : collectThemes(playlists.value, sounds.value),
  );

  /** The theme and its owner when the soundboard has something that answers it, so Play never does nothing. */
  const playable = computed(() => {
    const r = resolved.value;
    if (!r?.theme || !r.from) return null;
    return ambience.targetFor(r.theme) === null ? null : { theme: r.theme, ownerId: r.from.id };
  });
  const playing = computed(() => playable.value !== null && ambience.isPlaying(playable.value.ownerId));

  /** A theme the soundboard does not answer yet: said, so a silent Play is never a mystery. */
  const unanswered = computed(() => {
    const r = resolved.value;
    return soundboardLoaded.value && r?.theme && playable.value === null ? r.theme : null;
  });

  function toggle() {
    const p = playable.value;
    const here = place.value;
    if (!p || !here) return;
    if (playing.value) ambience.stop();
    else ambience.play({ themeOwnerId: p.ownerId, theme: p.theme, label: here.name });
  }

  return {
    place,
    draft,
    placeholder,
    themes,
    playable: computed(() => playable.value !== null),
    playing,
    unanswered,
    toggle,
    status: autosave.status,
    saveError: autosave.saveError,
    saveNow: autosave.saveNow,
  };
}
