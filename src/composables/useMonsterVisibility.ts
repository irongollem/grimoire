import { computed } from "vue";
import type { Ref, ComputedRef } from "vue";
import type { Monster } from "@/types/monster.types";
import { useParty } from "@/composables/useParty";
import {
  useCampaignDiscoveries,
  useToggleMonsterDiscovery,
  useUpdateDiscoveryVisibility,
  useUpdateDiscoveryStats,
} from "@/composables/useDiscoveredMonsters";

/**
 * Encapsulates all per-monster discovery/visibility state and mutations.
 * Pass a reactive ref to the current monster; all returned functions operate on it.
 * Used in both MonsterDetailView (single monster) and MonsterList (popover monster).
 */
export function useMonsterVisibility(
  monster: Ref<Monster | null | undefined> | ComputedRef<Monster | null | undefined>,
) {
  const { data: discoveries } = useCampaignDiscoveries();
  const { data: party } = useParty();
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

  function setWholeParty() {
    const m = monster.value;
    if (!m) return;
    const d = currentDiscovery.value;
    if (!d) toggleDiscovery({ monster: m, currentDiscovery: undefined, visibleTo: allPartyIds.value });
    else updateVisibility({ id: d.id, visibleTo: allPartyIds.value });
  }

  function toggleMember(memberId: string) {
    const m = monster.value;
    if (!m) return;
    const d = currentDiscovery.value;
    if (!d) {
      toggleDiscovery({ monster: m, currentDiscovery: undefined, visibleTo: [memberId] });
      return;
    }
    const current: string[] = d.visible_to === null ? allPartyIds.value : [...d.visible_to];
    const next = current.includes(memberId)
      ? current.filter((id) => id !== memberId)
      : [...current, memberId];
    updateVisibility({ id: d.id, visibleTo: next });
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
