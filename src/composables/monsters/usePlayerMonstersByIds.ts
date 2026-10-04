import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { fetchLibraryMonsterArtEntries, withLibraryArtAll } from "@/composables/library/useLibraryMonsterArt";
import { fetchPlayerVisibleMonsters } from "@/composables/monsters/useMonsters";
import { fetchLibraryMonstersByIds, useMonstersByIds } from "@/composables/monsters/useMonstersByIds";
import { isUuid } from "@/lib/library/contentIdentity";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import type { PlayerVisibleMonster } from "@/types/monster.types";

/** Same keys the by-ids readers use, so an edit's prefix invalidation reaches them. */
const PLAYER_BY_IDS_KEY = ["monsters", "player-by-ids"] as const;
const PLAYER_PROJECTION_KEY = ["monsters", "player-visible"] as const;
const ART_ENTRIES_KEY = ["library-monster-art", "entries"] as const;

/** Resolves the monster ids a player SURFACE already holds (discoveries, pinned
 *  forms, known forms, a quest's attachments, a mention) to monsters, reading
 *  only those rows.
 *
 *  - Library ids (text): one `library_monsters` read by id plus art for just
 *    those ids. Library rows are public, so a player may read any by id.
 *  - Custom ids (uuid): the SECURITY DEFINER `get_player_visible_monsters`
 *    projection, which is small (discovered or pinned rows only) and nulls
 *    `stat_block` unless the DM revealed it, hence `PlayerVisibleMonster`. A
 *    player cannot read the `monsters` table, so no by-id read is attempted.
 *  - A DM, or DM preview, owns the rows: it delegates to `useMonstersByIds`.
 *
 *  No source, ruleset or campaign filter on held ids: a creature the party has
 *  met must not vanish because the source was later switched off. Ids that match
 *  no row are absent from the map. */
export function usePlayerMonstersByIds(
  ids: MaybeRefOrGetter<readonly (string | null | undefined)[]>,
): { data: ComputedRef<Map<string, PlayerVisibleMonster>>; isLoading: ComputedRef<boolean> } {
  const ui = useUiStore();
  const auth = useAuthStore();
  const campaign = useCampaignStore();
  const viewerIsDm = () => ui.dmPreviewMode || auth.isDM;

  const unique = computed(() => [...new Set(toValue(ids).filter((id): id is string => !!id))].sort());
  const dmIds = computed(() => (viewerIsDm() ? unique.value : []));
  const libraryIds = computed(() => (viewerIsDm() ? [] : unique.value.filter((id) => !isUuid(id))));
  const customIds = computed(() => (viewerIsDm() ? [] : unique.value.filter(isUuid)));

  const dm = useMonstersByIds(dmIds, { withArt: true });

  const libraryQuery = useQuery({
    queryKey: computed(() => [...PLAYER_BY_IDS_KEY, libraryIds.value] as const),
    queryFn: ({ queryKey: [, , idsKey] }) => fetchLibraryMonstersByIds(idsKey),
    enabled: () => libraryIds.value.length > 0,
    staleTime: Infinity,
  });
  const artQuery = useQuery({
    queryKey: computed(() => [...ART_ENTRIES_KEY, libraryIds.value] as const),
    queryFn: ({ queryKey: [, , idsKey] }) => fetchLibraryMonsterArtEntries(idsKey),
    enabled: () => libraryIds.value.length > 0,
    staleTime: 1000 * 60 * 30,
  });
  const projectionQuery = useQuery({
    queryKey: computed(() => [...PLAYER_PROJECTION_KEY, campaign.activeCampaignId] as const),
    queryFn: ({ queryKey: [, , campaignId] }) => {
      if (campaignId === null) throw new Error("usePlayerMonstersByIds fetched without a campaign");
      return fetchPlayerVisibleMonsters(campaignId);
    },
    enabled: () => customIds.value.length > 0 && !!campaign.activeCampaignId,
    staleTime: Infinity,
  });

  const data = computed(() => {
    if (viewerIsDm()) return dm.data.value;
    const out = new Map<string, PlayerVisibleMonster>();
    for (const m of withLibraryArtAll(libraryQuery.data.value ?? [], artQuery.data.value)) out.set(m.id, m);
    const wanted = new Set(customIds.value);
    for (const m of projectionQuery.data.value ?? []) if (wanted.has(m.id)) out.set(m.id, m);
    return out;
  });

  const isLoading = computed(() =>
    viewerIsDm()
      ? dm.isLoading.value
      : libraryQuery.isLoading.value || artQuery.isLoading.value || projectionQuery.isLoading.value,
  );
  return { data, isLoading };
}
