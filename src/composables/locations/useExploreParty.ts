import { computed, onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import { useSetExploreParty } from "@/composables/campaign/useCampaigns";
import { useToast } from "@/composables/useToast";
import { exploreToken, positionsOnSite, seedPartyPositions, type ExploreCell } from "@/lib/locations/explore";
import { useCampaignStore } from "@/stores/campaign";
import type { RunCombatant } from "@/types/encounter.types";
import type { CellKey } from "@/types/dungeonMap.types";
import type { PartyMember } from "@/types/party.types";

type Member = Pick<PartyMember, "id" | "name" | "current_hp" | "max_hp" | "portrait_url" | "portrait_focal_point">;

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
  partyRoomId: MaybeRefOrGetter<string | null>;
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

  // Anyone with no square yet is seated in the entrance room. A character who joins later is seated the same way,
  // and may share a square with someone already there: the DM drags them clear.
  watch(
    () => [members.value, toValue(input.roomCells)] as const,
    ([list, cells]) => {
      if (!list || !cells) return;
      const missing = list.filter((m) => !Object.hasOwn(positions.value, m.id));
      const seated = seedPartyPositions(missing, cells, toValue(input.roomOrder), toValue(input.partyRoomId));
      if (Object.keys(seated).length > 0) place(seated);
    },
    { immediate: true },
  );

  /** The party as tokens; a character with no square yet has none and is left off the map. */
  const tokens = computed<RunCombatant[]>(() =>
    (members.value ?? []).map((m) => exploreToken(m, Object.hasOwn(positions.value, m.id) ? positions.value[m.id] : null)),
  );

  return { positions, tokens, place, flush };
}
