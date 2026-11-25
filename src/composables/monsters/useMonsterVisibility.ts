import { computed } from "vue";
import type { Ref, ComputedRef } from "vue";
import type { Monster } from "@/types/monster.types";
import { useActiveParty } from "@/composables/party/useActiveParty";
import {
  useCampaignDiscoveries,
  useToggleMonsterDiscovery,
  useUpdateDiscoveryVisibility,
  useUpdateDiscoveryStats,
} from "@/composables/encounters/useDiscoveredMonsters";

/** What the reveal machinery reads of a monster: a list card is enough. */
export type RevealableMonster = Pick<Monster, "id" | "is_shared">;

/**
 * Encapsulates all per-monster discovery/visibility state and mutations.
 * Pass a reactive ref to the current monster; all returned functions operate on it.
 * Used in both MonsterDetailView (single monster) and MonsterList (popover monster).
 */
export function useMonsterVisibility(
  monster: Ref<RevealableMonster | null | undefined> | ComputedRef<RevealableMonster | null | undefined>,
) {
  const { data: discoveries } = useCampaignDiscoveries();
  const { data: party } = useActiveParty();
  const { mutate: toggleDiscovery } = useToggleMonsterDiscovery();
  const { mutate: updateVisibility } = useUpdateDiscoveryVisibility();
  const { mutate: updateStats } = useUpdateDiscoveryStats();

  const currentDiscovery = computed(() => {
    const m = monster.value;
    if (!m) return undefined;
    return discoveries.value?.find(
      (d) => (m.is_shared ? d.library_monster_id === m.id : d.monster_id === m.id),
    );
  });

  const isDiscovered = computed(() => !!currentDiscovery.value);

  const allPartyIds = computed(() => party.value?.map((p) => p.id) ?? []);

  function isMemberVisible(memberId: string): boolean {
    const d = currentDiscovery.value;
    if (!d) return false;
    if (d.visible_to === null) return true;
    return d.visible_to.includes(memberId);
  }

  /**
   * `null` is "the whole party", now and later (#1259): a list of today's ids would leave out a character who joins
   * after the reveal. So a list that reaches everyone at the table is stored as `null` too, the same rule the
   * database applies to `player_visible_to` everywhere else.
   */
  function audience(next: string[]): string[] | null {
    const party = allPartyIds.value;
    return party.length > 0 && party.every((id) => next.includes(id)) ? null : next;
  }

  function setWholeParty() {
    const m = monster.value;
    if (!m) return;
    const d = currentDiscovery.value;
    if (!d) toggleDiscovery({ monster: m, currentDiscovery: undefined, visibleTo: null });
    else updateVisibility({ id: d.id, visibleTo: null });
  }

  function toggleMember(memberId: string) {
    const m = monster.value;
    if (!m) return;
    const d = currentDiscovery.value;
    if (!d) {
      toggleDiscovery({ monster: m, currentDiscovery: undefined, visibleTo: audience([memberId]) });
      return;
    }
    const current: string[] = d.visible_to === null ? allPartyIds.value : [...d.visible_to];
    const next = current.includes(memberId)
      ? current.filter((id) => id !== memberId)
      : [...current, memberId];
    updateVisibility({ id: d.id, visibleTo: audience(next) });
  }

  function unshare() {
    const m = monster.value;
    const d = currentDiscovery.value;
    if (m && d) toggleDiscovery({ monster: m, currentDiscovery: d });
  }

  return {
    discoveries,
    party,
    currentDiscovery,
    isDiscovered,
    allPartyIds,
    isMemberVisible,
    setWholeParty,
    toggleMember,
    unshare,
    updateStats,
  };
}
