import { computed, onScopeDispose, ref, watch } from "vue";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useAmbiencePlayback } from "@/composables/locations/useAmbiencePlayback";
import { useAudioThemeTriggers } from "@/composables/soundboard/useAudioThemeTriggers";
import { usePlaylists } from "@/composables/soundboard/useSoundboardPlaylists";
import { useSounds } from "@/composables/soundboard/useSounds";
import { resolveInheritedTheme, type AmbienceLocationLike } from "@/lib/locations/ambience";

/**
 * The ambience of the place the character is in, at the AI table (#1021). It is the Atlas's own Play ambience
 * (`useAmbiencePlayback`, with the same inheritance up `parent_id` and the same reserved silence), pressed by the
 * player and then following the character from place to place: a new place's theme takes over, and a place with no
 * theme, or deliberate silence, stops it. The player layout has no audio bus of its own (the DM's layout mounts it),
 * so the listener is mounted here; the same bus and the same scenes answer, there is no second audio path.
 */
export function useTableAmbience(placeId: () => string | null) {
  useAudioThemeTriggers();
  // Off until the player asks for it, every time the table opens. Not remembered across loads on purpose: a browser
  // blocks sound that starts without a tap, so a remembered "on" left a Stop button over silence (24 Nov 2026), and
  // nobody's speakers should come alive because a page opened.
  const on = ref(false);
  const { data: locations } = useAllLocations();
  const { data: playlists } = usePlaylists();
  const { data: sounds } = useSounds();
  const ambience = useAmbiencePlayback();


  const resolved = computed(() => {
    const id = placeId();
    const all = locations.value;
    if (id === null || all === undefined) return null;
    return resolveInheritedTheme(id, new Map<string, AmbienceLocationLike>(all.map((l) => [l.id, l])));
  });
  const placeName = computed(() => locations.value?.find((l) => l.id === placeId())?.name ?? null);

  /** A theme here (own, or the nearest parent's). Silence resolves to no theme, so it hides the control as well. */
  const offered = computed(() =>
    resolved.value?.theme && resolved.value.from ? { theme: resolved.value.theme, ownerId: resolved.value.from.id } : null,
  );
  /** What the theme would play: null while the soundboard loads, or when no scene answers it. */
  const answered = computed(() => {
    const o = offered.value;
    return o !== null && ambience.targetFor(o.theme) !== null ? o : null;
  });
  /** A theme the soundboard does not answer yet: said, so a silent button is never a mystery. */
  const unanswered = computed(() =>
    playlists.value !== undefined && sounds.value !== undefined && offered.value !== null && answered.value === null
      ? offered.value.theme
      : null,
  );

  // Keyed on the theme's owner, as `usePartyAmbience` is: walking between two rooms that inherit from one place
  // changes nothing, so the scene is not started over.
  const playKey = computed(() => (on.value && answered.value !== null ? `${answered.value.ownerId}|${answered.value.theme}` : null));
  let started = false;
  watch(
    playKey,
    (key) => {
      const target = answered.value;
      if (key !== null && target !== null) {
        started = true;
        ambience.play({ themeOwnerId: target.ownerId, theme: target.theme, label: placeName.value ?? target.theme });
      } else if (started) {
        started = false;
        ambience.stop();
      }
    },
    { immediate: true },
  );
  // Leaving the table ends its sound.
  onScopeDispose(() => {
    if (started) ambience.stop();
  });

  function toggle(): void {
    on.value = !on.value;
  }

  return { offered: computed(() => offered.value !== null), on: computed(() => on.value), unanswered, toggle };
}
