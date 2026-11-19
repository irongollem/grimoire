import { usePcAttackRows } from "@/composables/encounters/usePcAttackRows";
import { useUpdateInventoryItem } from "@/composables/items/usePartyInventory";
import { drawLine, planDraw } from "@/lib/table/solo/fight/drawWeapon";
import type { PartyMember } from "@/types/party.types";

/**
 * Draws a carried weapon into the main hand. Resolves with the margin line once both writes have landed, and
 * rejects (writing nothing more) when one fails, so the caller spends the turn's small thing only on success.
 * The old main-hand weapon is put away first so the two never both claim the hand, and goes back into the hand if
 * the draw itself then fails.
 */
export function useDrawWeapon(member: () => PartyMember) {
  const { memberInventory } = usePcAttackRows(member);
  const { mutateAsync } = useUpdateInventoryItem();

  async function draw(rowId: string): Promise<string> {
    const plan = planDraw(memberInventory.value, rowId);
    if (plan === null) throw new Error("That weapon is no longer carried.");
    const drawn = memberInventory.value.find((i) => i.id === rowId)!;
    const away = plan.putAway === null ? null : memberInventory.value.find((i) => i.id === plan.putAway!.id)!;
    if (plan.putAway) await mutateAsync(plan.putAway);
    try {
      await mutateAsync(plan.draw);
    } catch (error) {
      // The old weapon is already in the pack and the new one never reached the hand: put the old one back, so a
      // failed draw does not leave the character empty-handed. If that fails too, the first failure is the one told.
      if (away !== null) {
        await mutateAsync({ id: away.id, update: { location: away.location, slot: away.slot, is_equipped: away.is_equipped } }).catch(() => {});
      }
      throw error;
    }
    return drawLine(member().name, drawn.name, away === null ? null : away.name);
  }

  return { draw };
}
