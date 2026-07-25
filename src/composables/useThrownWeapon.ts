import { useCampaignMessages } from "@/composables/useCampaignMessages";
import { useUpdateInventoryItem, useRemoveInventoryItem } from "@/composables/usePartyInventory";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";

/**
 * Throwing a thrown weapon (javelin, dagger, handaxe, spear) at range: the
 * physical weapon leaves the hand, so one is dropped onto the ground as a
 * recoverable `item_drop` in campaign chat (reusing the existing drop/grab
 * flow — no new routes), and the equipped stack is decremented. Throwing the
 * last one removes the row entirely (you are out of that weapon).
 *
 * Shared by the player's own combat tab and the DM encounter runner so a throw
 * behaves identically whoever clicks it.
 */
export function useThrownWeapon() {
  const { sendItemDrop } = useCampaignMessages();
  const updateInventoryItem = useUpdateInventoryItem();
  const removeInventoryItem = useRemoveInventoryItem();

  async function throwWeapon(inv: PartyInventoryItem, item: Item | null, senderName?: string) {
    // Land one on the ground — a normal recoverable chat drop anyone can grab.
    await sendItemDrop(
      inv.name,
      inv.item_id,
      1,
      item?.rarity ?? "mundane",
      senderName,
      item?.image_url ?? null,
      item?.description ?? null,
      false,
    );
    // Remove it from the wielder's equipped stack.
    if (inv.quantity > 1) {
      updateInventoryItem.mutate({ id: inv.id, update: { quantity: inv.quantity - 1 } });
    } else {
      removeInventoryItem.mutate(inv.id);
    }
  }

  return { throwWeapon };
}
