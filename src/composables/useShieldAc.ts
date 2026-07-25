import { computed } from "vue";
import { usePartyInventory } from "@/composables/usePartyInventory";
import { useItems, usePlayerVisibleItems } from "@/composables/useItems";
import { shieldAcBonusByMember } from "@/lib/shieldAc";
import { equippedArmorByMember, armorAcFor, type ParsedArmor } from "@/lib/armorAc";

/** The member fields the AC resolver needs — a `PartyMember` satisfies this. */
type AcMember = { id: string; ac: number; ac_formula?: string | null; dex: number };

/**
 * Reactive AC resolver, per party member.
 *
 * A member's stored `ac` is their armor class WITHOUT shield. On top of it:
 *  - When `ac_formula === "armor"`, the base AC is live-derived from the
 *    currently-equipped body armor + the member's Dex (so swapping armor updates
 *    every sheet instantly, exactly like shields). Falls back to stored `ac`
 *    when no parseable armor is equipped.
 *  - Any equipped (non-ruined) shield in the paper doll adds its bonus.
 *
 * Wildshaped characters use the beast's AC instead — call sites keep the
 * `beast_ac ?? …` precedence and never route through here while shaped.
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

  const armorByMember = computed(() =>
    equippedArmorByMember(inventory.value ?? [], mergedItems.value),
  );

  function bonusFor(memberId: string | null | undefined): number {
    if (!memberId) return 0;
    return bonusByMember.value[memberId] ?? 0;
  }

  /** Parsed body armor equipped by a member, or null when none is derivable. */
  function armorFor(memberId: string | null | undefined): ParsedArmor | null {
    if (!memberId) return null;
    return armorByMember.value[memberId] ?? null;
  }

  /** AC before the shield — live-derived from equipped armor for the "armor"
   *  formula, otherwise the stored `ac` (which already bakes in other formulas). */
  function baseAcFor(member: AcMember): number {
    if (member.ac_formula === "armor") {
      const parsed = armorByMember.value[member.id];
      if (parsed) return armorAcFor(parsed, member.dex);
    }
    return member.ac;
  }

  /** Fully resolved AC = base (armor or stored) + equipped shield. Excludes
   *  Wild Shape; call sites apply `beast_ac ?? acFor(member)`. */
  function acFor(member: AcMember): number {
    return baseAcFor(member) + (bonusByMember.value[member.id] ?? 0);
  }

  return { bonusByMember, bonusFor, armorByMember, armorFor, baseAcFor, acFor };
}
