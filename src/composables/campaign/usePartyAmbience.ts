import { computed, ref, watch, onScopeDispose } from "vue";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import { useAllLocations } from "@/composables/locations/useLocations";
import { requestAudioTheme, releaseAudioTheme, type AudioThemeRequest } from "@/lib/audio/audioTriggers";
import type { Location } from "@/types/location.types";

/**
 * Domain placement (see CLAUDE.md's composable-placement rule): this lives in
 * `composables/campaign/`, not `composables/party/`, because both inputs it
 * reads are campaign-row concerns — `campaigns.current_location_id`, the
 * field `src/lib/partyPosition.ts` documents as the party's authoritative
 * position, and the campaign's session state — read the same way
 * `useCampaignSession`/`useCampaignPresence` beside it already do. It is not
 * about party *members*: it never reads the roster or a member's own
 * `current_location_id` override, which is what `composables/party/` owns.
 */

/**
 * Own sourceId namespace, distinct from `LocationSheet`'s `location:${id}`.
 * Two producers can otherwise both hold a scene for the exact place the party
 * occupies — the DM browsing it in a sheet, and the party literally being
 * there — and without separate namespaces, one's release would cut the
 * other's ambience out from under it.
 */
export function partyAmbienceSourceId(locationId: string): string {
  return `party:${locationId}`;
}

/**
 * What the party's ambience slot should own right now, or null when nothing
 * should follow the party.
 *
 * Pure on purpose: the two rules that matter here — no session, no request;
 * no theme, no request — are covered without mounting Vue reactivity,
 * TanStack Query, or the audio bus.
 */
export function resolvePartyAmbience(
  sessionRunning: boolean,
  location: Pick<Location, "id" | "name" | "audio_theme"> | null | undefined,
): AudioThemeRequest | null {
  if (!sessionRunning) return null;
  if (!location?.audio_theme) return null;
  return {
    sourceId: partyAmbienceSourceId(location.id),
    theme: location.audio_theme,
    slot: "ambient",
    label: location.name,
    kind: "location",
  };
}

/**
 * Keeps the ambient slot following the party's position, for as long as — and
 * only as long as — a session is running. Mounted once, app-level, in
 * `DefaultLayout` beside `useAudioThemeTriggers`: the party's position is
 * campaign-wide state, not a per-route concern, so a DM browsing the Atlas or
 * a quest beat must hear the same room the whole time.
 *
 * A DM tidying locations on a Tuesday must not start music because they
 * changed a dropdown — that is `LocationSheet`'s prep-time preview, which is
 * untouched. This composable only ever reacts to where the party actually is.
 */
export function usePartyAmbience(): void {
  const campaign = useCampaignStore();
  const ui = useUiStore();

  // Deferred until a session is actually running, the same way the generator
  // panels in DefaultLayout defer their own fetch: most Tuesdays never need
  // this list, and once it is fetched it is the same cached list the Atlas
  // and every location editor already share (shared query key).
  const { data: locations } = useAllLocations(() => ui.sessionRunning);

  const partyLocation = computed<Location | null>(() => {
    const id = campaign.activeCampaign?.current_location_id;
    if (!id) return null;
    return locations.value?.find((loc) => loc.id === id) ?? null;
  });

  // What we currently hold, if anything — tracked ourselves rather than
  // re-derived, so releasing on session-end or on unmount always names the
  // right sourceId even after `locations`/`partyLocation` have moved on.
  const active = ref<AudioThemeRequest | null>(null);

  watch(
    [() => ui.sessionRunning, partyLocation],
    () => {
      const next = resolvePartyAmbience(ui.sessionRunning, partyLocation.value);
      const previous = active.value;
      if (previous?.sourceId === next?.sourceId) {
        active.value = next;
        return;
      }
      // Request first, release second — mirroring `LocationSheet` exactly:
      // the new scene takes the slot before the old one lets go, so moving
      // between two themed rooms crosses over instead of cutting to silence
      // and back on.
      if (next) requestAudioTheme(next);
      if (previous) releaseAudioTheme(previous.sourceId);
      active.value = next;
    },
    { immediate: true },
  );

  // `onScopeDispose` rather than `onUnmounted`: this runs inside a plain
  // `effectScope` in tests (no component instance to attach to), and it still
  // fires on a real component unmount since Vue tears down a component's
  // internal scope the same way.
  onScopeDispose(() => {
    if (active.value) releaseAudioTheme(active.value.sourceId);
  });
}
