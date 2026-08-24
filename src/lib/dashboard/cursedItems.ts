import type { PartyInventoryItem } from "@/types/inventory.types";
import type { Item } from "@/types/item.types";
import type { PartyMember } from "@/types/party.types";

/**
 * The DM's "they don't know yet" list for the dashboard (#764).
 *
 * A `PartyInventoryItem` does not carry curse text itself — `curse_description`
 * lives on the linked `items` row (`item_id`), and whether the *party* knows
 * about it lives on the inventory row (`curse_revealed`). Cursedness is
 * therefore a join, not a column, and same reasoning as `downtimeQueue.ts` and
 * `dmScreenCard.ts`: the join, the carrier lookup and the ordering are cheap to
 * test here and expensive to test through a mounted card.
 */

/** One hidden curse as the widget shows it. */
export interface CursedItemRow {
  invId: string;
  /** The inventory row's own name — matches how `UnidentifiedWidget` labels
   *  its rows, so a custom-named item (no vault `item_id`) still displays. */
  itemName: string;
  /**
   * Who's carrying it: the member's name, `"Party stash"` for an item with no
   * carrier, or `"??? (removed)"` for a carrier id the roster no longer has —
   * the same marker `downtimeQueue.ts` uses for the same situation, so the two
   * DM-facing "the roster moved on" cases read the same across the dashboard.
   */
  carrierName: string;
  /** The party member id to deep-link to, or null when there is no member to
   *  link to (party stash, or a carrier the roster has since removed). */
  carrierId: string | null;
}

/**
 * Every inventory row that is cursed and whose curse the party has not been
 * told about, joined against the roster and the vault catalogue.
 *
 * "Cursed" is `vaultItem.curse_description` being non-null — a row with no
 * `item_id` (a custom-named entry with no vault item) can never match, since
 * there is no curse text to have. Already-revealed curses are excluded on
 * purpose: once `curse_revealed` is true the party knows, so it stops being
 * this widget's business — see `ItemDetailPanel`'s own reveal toggle, which is
 * the only place this flag ever flips.
 *
 * Sorted alphabetically by item name. There is no meaningful time dimension
 * here (unlike the downtime queue's "oldest first") — a curse does not carry a
 * "discovered at" timestamp — so a stable, predictable order was chosen over
 * reusing the inventory query's own `sort_order`, which encodes shelf position
 * within one character's pack, not a cross-carrier ordering.
 */
export function buildCursedItems(
  inventory: readonly PartyInventoryItem[],
  members: readonly PartyMember[],
  items: readonly Item[],
): CursedItemRow[] {
  const membersById = new Map(members.map((member) => [member.id, member] as const));
  const itemsById = new Map(items.map((item) => [item.id, item] as const));

  return inventory
    .filter((inv) => {
      if (inv.curse_revealed) return false;
      const vaultItem = inv.item_id ? itemsById.get(inv.item_id) : undefined;
      return !!vaultItem?.curse_description;
    })
    .map((inv) => {
      const member = inv.carried_by ? membersById.get(inv.carried_by) : undefined;
      return {
        invId: inv.id,
        itemName: inv.name,
        carrierName: inv.carried_by === null ? "Party stash" : (member?.name ?? "??? (removed)"),
        carrierId: member?.id ?? null,
      };
    })
    .sort((a, b) => a.itemName.localeCompare(b.itemName));
}
