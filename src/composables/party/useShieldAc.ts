import { computed } from "vue";
import { createSharedComposable } from "@vueuse/core";
import { usePartyInventory } from "@/composables/items/usePartyInventory";
import { usePlayerItemProjection } from "@/composables/items/useItems";
import { useAuthStore } from "@/stores/auth";
import { useStoredItemRefs } from "@/composables/items/useStoredItemRefs";
import { inventoryItemRef } from "@/lib/itemRef";
import { shieldAcBonusByMember } from "@/rules/shieldAc";
import { equippedArmorByMember, resolveBaseAc, type ParsedArmor } from "@/rules/armorAc";

/** The member fields the AC resolver needs — a `PartyMember` satisfies this. */
type AcMember = { id: string; ac: number; ac_formula?: string | null; dex: number };

/**
 * Reactive AC resolver, per party member.
 *
 * A member's stored `ac` is their armor class WITHOUT shield. On top of it:
 *  - The base AC (before shield) is resolved from `ac_formula` + equipped body
 *    armor via `resolveBaseAc` (see `@/rules/armorAc` for the full rules table),
 *    so swapping armor updates every sheet instantly, exactly like shields.
 *  - Any equipped (non-ruined) shield in the paper doll adds its bonus.
 *
 * Wildshaped characters use the beast's AC instead — call sites keep the
 * `beast_ac ?? …` precedence and never route through here while shaped.
 *
 * Shared across all v-for rows via `createSharedComposable` — each row
 * (RunnerCombatantRow/Card, PartyTrackerRow, …) previously instantiated its
 * own copy, re-scanning the full inventory + item catalog per row.
 */
function useShieldAcBonusImpl() {
  const { data: inventory } = usePartyInventory();
  // Runs in both DM and player contexts, and reads only the equipped ids (#972,
  // never the catalogue). The DM reads those ids directly (owner policy, library
  // ids included); a player resolves them in the gated projection (base items RLS
  // is owner-only since 20260711000014), with library ids read by id. Equipped gear
  // is *held*, so no edition or book filter applies (#961).
  const auth = useAuthStore();
  const refs = computed(() => (inventory.value ?? []).map(inventoryItemRef));
  const { items: dmItems } = useStoredItemRefs(() => (auth.isDM ? refs.value : []));
  const { data: projection } = usePlayerItemProjection(() => ({ enabled: !auth.isDM }));
  const { items: playerItems } = useStoredItemRefs(() => (auth.isDM ? [] : refs.value), projection);
  const mergedItems = computed(() => (auth.isDM ? dmItems.value : playerItems.value));

  const bonusByMember = computed(() =>
    shieldAcBonusByMember(inventory.value ?? [], mergedItems.value),
  );

  const armorByMember = computed(() =>
    equippedArmorByMember(inventory.value ?? [], mergedItems.value),
  );

  /** Parsed body armor equipped by a member, or null when none is derivable. */
  function armorFor(memberId: string | null | undefined): ParsedArmor | null {
    if (!memberId) return null;
    return armorByMember.value[memberId] ?? null;
  }

  /** AC before the shield — thin delegate to the pure `resolveBaseAc` rules
   *  table in `@/rules/armorAc`. */
  function baseAcFor(member: AcMember): number {
    return resolveBaseAc(member.ac_formula, member.ac, armorByMember.value[member.id] ?? null, member.dex);
  }

  /** Fully resolved AC = base (armor or stored) + equipped shield. Excludes
   *  Wild Shape; call sites apply `beast_ac ?? acFor(member)`. */
  function acFor(member: AcMember): number {
    return baseAcFor(member) + (bonusByMember.value[member.id] ?? 0);
  }

  return { bonusByMember, armorByMember, armorFor, acFor };
}

/** Shared across all instances (see composable docstring above) — avoids
 *  re-scanning inventory + item catalog once per rendered combatant row. */
export const useShieldAcBonus = createSharedComposable(useShieldAcBonusImpl);
