import { computed } from "vue";
import { createSharedComposable } from "@vueuse/core";
import { usePartyInventory } from "@/composables/items/usePartyInventory";
import { usePlayerItemProjection } from "@/composables/items/useItems";
import { useAuthStore } from "@/stores/auth";
import { useStoredItemRefs } from "@/composables/items/useStoredItemRefs";
import { inventoryItemRef } from "@/lib/itemRef";
import { calculateAc, previousAc, wornGearByMember, type AcBreakdown, type AcMember, type WornGear } from "@/rules/armorClass";

/**
 * Reactive Armour Class, per party member.
 *
 * AC is worked out from the character and what they have on (see
 * `@/rules/armorClass` for the rules); nothing is stored. Swapping armour or
 * moving a shield on the paper doll updates every sheet at once.
 *
 * Wild Shape is not applied here: a shaped character's AC is the beast's, so
 * call sites keep `wildshape_state?.beast_ac ?? acFor(member)`.
 *
 * Shared across all v-for rows via `createSharedComposable` — each row
 * (RunnerCombatantRow/Card, PartyTrackerRow, ...) would otherwise instantiate its
 * own copy and re-scan the inventory and item catalog per row.
 */
function useArmorClassImpl() {
  const { data: inventory, isSuccess: inventoryLoaded } = usePartyInventory();
  // Runs in both DM and player contexts, and reads only the equipped ids (#972,
  // never the catalogue). The DM reads those ids directly (owner policy, library
  // ids included); a player resolves them in the gated projection (base items RLS
  // is owner-only since 20260711000014), with library ids read by id. Equipped gear
  // is *held*, so no edition or book filter applies (#961).
  const auth = useAuthStore();
  const refs = computed(() => (inventory.value ?? []).map(inventoryItemRef));
  const { items: dmItems, isLoading: dmLoading } = useStoredItemRefs(() => (auth.isDM ? refs.value : []));
  const { data: projection } = usePlayerItemProjection(() => ({ enabled: !auth.isDM }));
  const { items: playerItems, isLoading: playerLoading } = useStoredItemRefs(() => (auth.isDM ? [] : refs.value), projection);
  const mergedItems = computed(() => (auth.isDM ? dmItems.value : playerItems.value));

  const gearByMember = computed(() => wornGearByMember(inventory.value ?? [], mergedItems.value));

  /** Currently resolved worn gear for the paper doll; empty when none is available for the member. */
  function wornGearFor(memberId: string): WornGear[] {
    return gearByMember.value[memberId] ?? [];
  }

  /** The AC and the lines that make it up. */
  function acBreakdownFor(member: AcMember): AcBreakdown {
    return calculateAc(member, gearByMember.value[member.id] ?? []);
  }

  /** The AC total. Excludes Wild Shape; call sites apply `beast_ac ?? acFor(member)`. */
  function acFor(member: AcMember): number {
    return acBreakdownFor(member).total;
  }

  /** The AC the sheet showed before it was calculated; see `previousAc`. */
  function previousAcFor(member: AcMember & { ac: number }): number {
    return previousAc(member, gearByMember.value[member.id] ?? []);
  }

  /**
   * True once the gear is known. Until then every AC reads as if nothing were worn,
   * so anything that compares the calculated AC against something (the one-time
   * notice) must wait for this.
   */
  const isReady = computed(
    () =>
      inventoryLoaded.value &&
      !dmLoading.value &&
      !playerLoading.value &&
      (auth.isDM || projection.value !== undefined),
  );

  return { acFor, acBreakdownFor, previousAcFor, wornGearFor, isReady };
}

/** Shared across all instances (see composable docstring above). */
export const useArmorClass = createSharedComposable(useArmorClassImpl);
