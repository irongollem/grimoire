import { computed } from "vue";
import { usePartyInventory } from "@/composables/usePartyInventory";
import { useItems } from "@/composables/useItems";
import { shieldAcBonusByMember } from "@/lib/shieldAc";

/**
 * Reactive AC bonus from equipped shields, per party member.
 * A member's stored `ac` is their armor class WITHOUT shield; the bonus from
 * an equipped (non-ruined) shield in the paper doll is added at display time.
 * Wildshaped characters use the beast's AC instead — don't add the bonus there.
 */
export function useShieldAcBonus() {
  const { data: inventory } = usePartyInventory();
  const { data: items } = useItems();

  const bonusByMember = computed(() =>
    shieldAcBonusByMember(inventory.value ?? [], items.value ?? []),
  );

  function bonusFor(memberId: string | null | undefined): number {
    if (!memberId) return 0;
    return bonusByMember.value[memberId] ?? 0;
  }

  return { bonusByMember, bonusFor };
}
