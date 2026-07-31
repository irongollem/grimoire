import { computed } from "vue";
import { createSharedComposable } from "@vueuse/core";
import { usePartyInventory } from "@/composables/usePartyInventory";
import { useItems, usePlayerVisibleItems } from "@/composables/useItems";
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
