import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { fetchPlayerVisibleMonsters } from "@/composables/monsters/useMonsters";
import { useMonsterIndex } from "@/composables/monsters/useMonsterIndex";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { parseCr } from "@/lib/utils";
import { wildShapeCandidateCost, type WildShapeCandidateFields, type WildShapeRules } from "@/rules/wildshape";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";
import type { MonsterIndexEntry, PlayerVisibleMonster } from "@/types/monster.types";

/** Same key `usePlayerMonstersByIds` reads, so the projection is fetched once. */
const PLAYER_PROJECTION_KEY = ["monsters", "player-visible"] as const;

/** What a wild shape picker shows and acts on: a name, a rating, and the two
 *  ids a "share" or a "learn" needs. */
export type WildShapeCandidate = Pick<MonsterIndexEntry, "id" | "name" | "challenge_rating" | "is_shared">;

/** Every beast a druid with `rules` could legally take, lowest CR first, from
 *  the slim bestiary index rather than the whole stat-block list. Only a picker
 *  that must offer beasts nobody has met reads it, and only once it opens
 *  (`enabled`).
 *
 *  - A DM (preview or own role) reads the index in full: it owns the custom rows.
 *  - A player cannot read the `monsters` table, so the library half of the index
 *    is joined with the custom monsters the DM has revealed, from the small
 *    `get_player_visible_monsters` projection. That projection nulls `stat_block`
 *    for an unrevealed creature, and with no stat block there is no CR or speed
 *    to judge, so such a row is not a candidate. */
export function useWildShapeCandidates(
  rules: MaybeRefOrGetter<WildShapeRules>,
  getOptions: () => { enabled: boolean },
): { data: ComputedRef<WildShapeCandidate[]>; isLoading: ComputedRef<boolean> } {
  const appUi = useAppUiStore();
  const auth = useAuthStore();
  const campaign = useCampaignStore();
  const { ruleset } = useTableRuleset();
  const viewerIsDm = () => appUi.dmPreviewMode || auth.isDM;

  const index = useMonsterIndex(() => ({
    enabled: getOptions().enabled,
    sides: viewerIsDm() ? "both" : "library",
  }));

  const projection = useQuery({
    queryKey: computed(() => [...PLAYER_PROJECTION_KEY, campaign.activeCampaignId] as const),
    queryFn: ({ queryKey: [, , campaignId] }) => {
      if (campaignId === null) throw new Error("useWildShapeCandidates fetched without a campaign");
      return fetchPlayerVisibleMonsters(campaignId);
    },
    enabled: () => getOptions().enabled && !viewerIsDm() && !!campaign.activeCampaignId,
    staleTime: Infinity,
  });

  const data = computed<WildShapeCandidate[]>(() => {
    const fields: (WildShapeCandidate & WildShapeCandidateFields)[] = [...(index.data.value ?? [])];
    if (!viewerIsDm()) {
      const projected: PlayerVisibleMonster[] = projection.data.value ?? [];
      for (const m of projected) {
        // Open5e imports are legacy rows that surface through the library now.
        if (m.open5e_import || (m.ruleset && m.ruleset !== ruleset.value)) continue;
        const sb = m.stat_block;
        if (sb === null) continue;
        fields.push({
          id: m.id,
          name: m.name,
          monster_type: m.monster_type,
          challenge_rating: sb.challenge_rating,
          speed: sb.speed,
          is_shared: false,
        });
      }
    }
    const ruleValue = toValue(rules);
    return fields
      .filter((m) => wildShapeCandidateCost(m, ruleValue) !== null)
      .map(({ id, name, challenge_rating, is_shared }) => ({ id, name, challenge_rating, is_shared }))
      .sort((a, b) => parseCr(a.challenge_rating) - parseCr(b.challenge_rating));
  });

  const isLoading = computed(() => index.isLoading.value || projection.isLoading.value);
  return { data, isLoading };
}
