import { computed, onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import { useSetExploreParty } from "@/composables/campaign/useCampaigns";
import { useToast } from "@/composables/useToast";
import { useSpeciesByIds } from "@/composables/rules/useSpecies";
import {
  exploreTokens,
  memberSize,
  positionsOnSite,
  seatInFormation,
  seedPartyAtEntrance,
  seedPartyAtCentre,
  seedPartyPositions,
  type ExploreCell,
  type ExploreFrame,
} from "@/lib/locations/explore";
import { useCampaignStore } from "@/stores/campaign";
import type { RunCombatant } from "@/types/encounter.types";
import type { MonsterSize } from "@/types/monster.types";
import type { CellKey } from "@/types/dungeonMap.types";
import type { PartyMember } from "@/types/party.types";

type Member = Pick<PartyMember, "id" | "name" | "current_hp" | "max_hp" | "portrait_url" | "portrait_focal_point">;

/**
 * How big each character is, by the book (species, or the subrace that replaces it): the size their token covers on
 * the grid. Null for a character whose species has not loaded or who has none, which draws as Medium.
 */
export function usePartyTokenSizes(
  members: MaybeRefOrGetter<readonly Pick<PartyMember, "id" | "species_id" | "subrace">[] | undefined>,
): (memberId: string) => MonsterSize | null {
  const { data: speciesById } = useSpeciesByIds(() => (toValue(members) ?? []).map((m) => m.species_id));
  return (memberId) => {
    const member = toValue(members)?.find((m) => m.id === memberId);
    if (!member?.species_id) return null;
    return memberSize(speciesById.value.get(member.species_id), member.subrace);
  };
}

/** How long a burst of moves (a drag, a run of clicks) waits before it is written as one. */
const WRITE_AFTER_MS = 400;

/**
 * The party's tokens on a site's grid while exploring (#1125 decision 9): where each character stands, mirrored
 * locally so a move feels instant, and written to `campaigns.explore_party` once per burst of moves. The first
 * time a site is explored the party is seated at its entrance. Nobody else writes the column while this is
 * mounted, so the local copy wins over a stale re-read until the write lands.
 */
export function useExploreParty(input: {
  siteId: MaybeRefOrGetter<string>;
  members: MaybeRefOrGetter<readonly Member[] | undefined>;
  /** Null until the site's map is known; seating waits for it. */
  roomCells: MaybeRefOrGetter<ReadonlyMap<string, CellKey[]> | null>;
  roomOrder: MaybeRefOrGetter<readonly string[]>;
  /** The squares of the site's Entrance zones, in battle cells: where an unplaced party walks in. Empty or omitted when there is none. */
  entranceCells?: MaybeRefOrGetter<readonly CellKey[]>;
  partyRoomId: MaybeRefOrGetter<string | null>;
  /** The picture's size in image cells, once it is known: where the party stands when the site has no room to seat them in. */
  frame?: MaybeRefOrGetter<ExploreFrame | null>;
  /** A character's size, so a Large one covers four squares; Medium for any it does not know. */
  sizeOf?: (memberId: string) => MonsterSize | null;
}) {
  const campaign = useCampaignStore();
  const toast = useToast();
  const { mutate: write } = useSetExploreParty();

  const positions = ref<Record<string, ExploreCell>>({});
  let timer: ReturnType<typeof setTimeout> | null = null;

  // Follow the campaign row until we have something unsent of our own.
  watch(
    () => [campaign.activeCampaign?.explore_party ?? null, toValue(input.siteId)] as const,
    ([stored, siteId]) => {
      if (timer === null) positions.value = positionsOnSite(stored, siteId);
    },
    { immediate: true },
  );

  function flush() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const campaignId = campaign.activeCampaignId;
    if (!campaignId) return;
    write(
      { id: campaignId, explore: { site_id: toValue(input.siteId), positions: positions.value } },
      { onError: (e) => toast.error(toast.fromError(e, "Couldn't save where the party stands.")) },
    );
  }

  /** Records new squares for some characters (one move, however many walk) and schedules the single write. */
  function place(moves: Record<string, ExploreCell>) {
    positions.value = { ...positions.value, ...moves };
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, WRITE_AFTER_MS);
  }

  onScopeDispose(() => {
    if (timer !== null) flush();
  });

  const members = computed(() => toValue(input.members));

  // Anyone with no square yet walks in at the Entrance zone when there is one, else is seated in the entrance room. A character who joins later is seated the same way,
  // and may share a square with someone already there: the DM drags them clear.
  watch(
    () => [members.value, toValue(input.roomCells), input.frame ? toValue(input.frame) : null, input.entranceCells ? toValue(input.entranceCells) : null] as const,
    ([list, cells]) => {
      if (!list || !cells) return;
      const missing = list.filter((m) => !Object.hasOwn(positions.value, m.id));
      const entrance = input.entranceCells ? seedPartyAtEntrance(missing, toValue(input.entranceCells), input.sizeOf) : {};
      if (Object.keys(entrance).length > 0) place(entrance);
      // Whoever the entrance had no room for falls back to the rooms, then the middle, exactly as with no entrance.
      const rest = missing.filter((m) => !Object.hasOwn(entrance, m.id));
      const seatedInRooms = seedPartyPositions(rest, cells, toValue(input.roomOrder), toValue(input.partyRoomId));
      if (Object.keys(seatedInRooms).length > 0) place(seatedInRooms);
      const seated = { ...entrance, ...seatedInRooms };
      // No room to stand in (nothing traced, or none on this frame): the middle of the picture, once its size is known.
      const unseated = missing.filter((m) => !Object.hasOwn(seated, m.id));
      const frame = input.frame ? toValue(input.frame) : null;
      if (unseated.length > 0 && frame) {
        const centred = seedPartyAtCentre(unseated, frame, input.sizeOf);
        if (Object.keys(centred).length > 0) place(centred);
      }
    },
    { immediate: true },
  );

  /** Stands these characters in formation at a clicked square: the ones with no square yet, wherever the click lands. */
  function seatAt(memberIds: readonly string[], at: ExploreCell) {
    const unplaced = (members.value ?? []).filter((m) => memberIds.includes(m.id) && !Object.hasOwn(positions.value, m.id));
    const seated = seatInFormation(unplaced, at, input.sizeOf);
    if (Object.keys(seated).length > 0) place(seated);
  }

  /** The party as tokens; a character with no square yet has none and is left off the map. */
  const tokens = computed<RunCombatant[]>(() => {
    const siteId = toValue(input.siteId);
    return exploreTokens(members.value ?? [], { site_id: siteId, positions: positions.value }, siteId, input.sizeOf);
  });

  return { positions, tokens, place, seatAt, flush };
}
