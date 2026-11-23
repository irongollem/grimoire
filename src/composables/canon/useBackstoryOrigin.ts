import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useAuthStore } from "@/stores/auth";
import { useAppUiStore } from "@/stores/ui/app";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import { useConnections } from "@/composables/connections/useConnections";
import type { BackstoryOrigin } from "@/components/connections/connectionRows";
import type { CanonEntry } from "@/types/canon.types";

/**
 * Which people in a character's connections came from their backstory: the NPCs the character's backstory entry is
 * `about`. The People rows for those carry a "From Canon" marker, on the Canon page and on the character's own page
 * alike, so the two lists read the same.
 *
 * It only looks. `useBackstoryEntry` makes the entry on first read, which the character's page must not do by being
 * looked at, so the entry is found among the campaign's canon entries and `undefined` is the answer when there is
 * none. Canon is a DM read, so for a player (or a DM previewing the player portal) nothing is requested at all.
 *
 * `entryInHand` is for a caller that already holds the entry (the Canon page's detail): the entries are not read for
 * it, and it has already proven the viewer may.
 */
export function useBackstoryOrigin(
  partyMemberId: MaybeRefOrGetter<string>,
  entryInHand?: MaybeRefOrGetter<CanonEntry | null>,
) {
  const auth = useAuthStore();
  const appUi = useAppUiStore();
  const supplied = entryInHand !== undefined;
  const mayRead = computed(() => supplied || (auth.isDM && !appUi.dmPreviewMode));

  const { data: entries } = useCanonEntries({ enabled: () => mayRead.value && !supplied });
  const entry = computed<CanonEntry | null>(() => {
    if (!mayRead.value) return null;
    if (supplied) return toValue(entryInHand) ?? null;
    return (entries.value ?? []).find((e) => e.part === "backstory" && e.party_member_id === toValue(partyMemberId)) ?? null;
  });
  const { data: ties } = useConnections("canon", () => entry.value?.id ?? null);

  return computed<BackstoryOrigin | undefined>(() => {
    const found = entry.value;
    if (found === null) return undefined;
    const npcIds = new Set((ties.value ?? []).filter((c) => c.type === "about" && c.other_kind === "npc").map((c) => c.other_id));
    return { entryId: found.id, npcIds };
  });
}
