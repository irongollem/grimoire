import { computed } from "vue";
import { usePartyInventory } from "@/composables/usePartyInventory";
import { useItems, usePlayerVisibleItems } from "@/composables/useItems";
import { shieldAcBonusByMember } from "@/lib/shieldAc";

/**
 * Reactive AC bonus from equipped shields, per party member.
 * A member's stored `ac` is their armor class WITHOUT shield; the bonus from
 * an equipped (non-ruined) shield in the paper doll is added at display time.
 * Wildshaped characters use the beast's AC instead — don't add the bonus there.
 */
export function useShieldAcBonus() {
  const { data: inventory } = usePartyInventory();
  // Runs in both DM and player contexts. The DM reads the full catalog (owner
  // policy); a player reads only their visible items via the projection (base
  // items RLS is owner-only since 20260711000014). Merge both so shield lookup
  // resolves regardless of who's viewing — one side is empty in each context.
  const { data: items } = useItems();
  const { data: playerItems } = usePlayerVisibleItems();

  const mergedItems = computed(() => {
    const base = items.value ?? [];
    const proj = playerItems.value ?? [];
    if (!proj.length) return base;
    if (!base.length) return proj;
    const byId = new Map(base.map((i) => [i.id, i]));
    for (const p of proj) if (!byId.has(p.id)) byId.set(p.id, p);
    return [...byId.values()];
  });

  const bonusByMember = computed(() =>
    shieldAcBonusByMember(inventory.value ?? [], mergedItems.value),
  );

  function bonusFor(memberId: string | null | undefined): number {
    if (!memberId) return 0;
    return bonusByMember.value[memberId] ?? 0;
  }

  return { bonusByMember, bonusFor };
}
