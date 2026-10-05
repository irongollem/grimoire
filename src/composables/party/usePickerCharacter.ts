import { computed } from "vue";
import { useRoute, useRouter, type RouteLocationRaw } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";
import { useMyCharacters, useParty } from "@/composables/party/useParty";
import { useCharacterPool } from "@/composables/party/useCharacterPool";
import type { PartyMember } from "@/types/party.types";

export interface PickerTargetInput {
  /** The `?memberId=` query value, if the URL carries one. */
  requested: string | null;
  dmPreview: boolean;
  dmPreviewId: string | null;
  activeId: string | null;
  /** Every character the viewer owns: at the active table and in the pool. */
  ownedIds: ReadonlySet<string>;
}

export interface PickerTarget {
  /** The character to act on; null when there is none. */
  id: string | null;
  /** A `?memberId=` that names nobody the viewer owns. Never falls back to another character. */
  notFound: boolean;
}

/**
 * Which character the species, background and spell pickers act on. One
 * decision for all three views: each re-deriving it is how an unknown id once
 * fell back to the ACTIVE character and edited the wrong one. DM preview comes
 * first, then an explicit `?memberId=` (owned, or refused), then the active one.
 */
export function resolvePickerTarget(input: PickerTargetInput): PickerTarget {
  if (input.dmPreview) return { id: input.dmPreviewId, notFound: false };
  if (input.requested !== null) {
    return input.ownedIds.has(input.requested)
      ? { id: input.requested, notFound: false }
      : { id: null, notFound: true };
  }
  return { id: input.activeId, notFound: false };
}

/**
 * Where a picker returns after a change. The active character's sheet is /play/character.
 * A character at the table that is not the active one has no sheet there, so it
 * goes to Champions (where its approval notice is). A pool character goes back
 * to its edit page if that is where the player came from, else to the pool.
 */
export function pickerReturnRoute(input: {
  isOtherCharacter: boolean;
  /** The character's table; null for a pool character. */
  campaignId: string | null;
  memberId: string;
  /** The path the player came from, if the router knows it. */
  back: string | null;
}): RouteLocationRaw {
  if (!input.isOtherCharacter) return "/play/character";
  if (input.campaignId) return { name: "play-champions" };
  if (input.back?.startsWith("/play/character/edit")) {
    return { name: "play-character-edit", query: { memberId: input.memberId } };
  }
  return { name: "play-home" };
}

/** The shared wiring of `resolvePickerTarget` for the three picker views. */
export function usePickerCharacter() {
  const route = useRoute();
  const router = useRouter();
  const auth = useAuthStore();
  const ui = useUiStore();
  const { data: party } = useParty();
  const { data: mine, isLoading: mineLoading } = useMyCharacters();
  const { data: pool, isLoading: poolLoading } = useCharacterPool();

  const requested = computed(() => (typeof route.query.memberId === "string" ? route.query.memberId : null));
  const ownedIds = computed(() => new Set([...(mine.value ?? []), ...(pool.value ?? [])].map((m) => m.id)));
  const target = computed(() =>
    resolvePickerTarget({
      requested: requested.value,
      dmPreview: ui.dmPreviewMode,
      dmPreviewId: ui.dmPreviewPartyMemberId,
      activeId: auth.linkedPartyMemberId,
      ownedIds: ownedIds.value,
    }),
  );

  const resolvedMemberId = computed(() => target.value.id);
  // Not "not found" while the lists the id is checked against are still loading.
  const notFound = computed(() => target.value.notFound && !mineLoading.value && !poolLoading.value);
  // The roster only has the active table; a pool character is found in the pool.
  const member = computed<PartyMember | null>(() => {
    const id = resolvedMemberId.value;
    if (!id) return null;
    return party.value?.find((m) => m.id === id) ?? pool.value?.find((m) => m.id === id) ?? mine.value?.find((m) => m.id === id) ?? null;
  });
  const isOtherCharacter = computed(() => !ui.dmPreviewMode && resolvedMemberId.value !== auth.linkedPartyMemberId);

  /** Where to go after changing `m`. */
  function afterChangeRoute(m: PartyMember): RouteLocationRaw {
    const back: unknown = router.options.history.state.back;
    return pickerReturnRoute({
      isOtherCharacter: isOtherCharacter.value,
      campaignId: m.campaign_id,
      memberId: m.id,
      back: typeof back === "string" ? back : null,
    });
  }

  return { resolvedMemberId, member, notFound, isOtherCharacter, afterChangeRoute };
}
