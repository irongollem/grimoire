import { ref, computed, type Ref, type ComputedRef } from "vue";
import { useConfirm } from "@/composables/useConfirm";
import { inventoryItemRef, itemRefColumns } from "@/lib/itemRef";
import {
  useAddInventoryItem,
  useAddInventoryItems,
  useUpdateInventoryItem,
  useRemoveInventoryItem,
  useReorderInventoryItems,
} from "@/composables/items/usePartyInventory";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import { useChatSendFailure } from "@/composables/campaign/chatSendErrors";
import type {
  PartyInventoryItem,
  InventoryLocation,
} from "@/types/inventory.types";
import { isUuid } from "@/lib/library/contentIdentity";
import { fetchResolvedItem } from "@/composables/items/useItems";
import type { Item, ItemIndexEntry } from "@/types/item.types";
import type { PartyMember } from "@/types/party.types";

interface UseInventoryMutationsOptions {
  resolvedMemberId: ComputedRef<string | null | undefined>;
  member: ComputedRef<PartyMember | null>;
  myItems: ComputedRef<PartyInventoryItem[]>;
  /** Resolves a row the character already carries (#961). */
  allItems: ComputedRef<Item[] | undefined>;
  /** What may be added, slim: the edition and enabled books narrow this, not `allItems`.
   *  A pick is read in full by id before it is written (#972). */
  catalogue: ComputedRef<ItemIndexEntry[] | undefined>;
  partyMembers: ComputedRef<PartyMember[] | undefined>;
  selectedInv: Ref<PartyInventoryItem | null>;
}

export function useInventoryMutations({
  resolvedMemberId,
  member,
  myItems,
  allItems,
  catalogue,
  partyMembers,
  selectedInv,
}: UseInventoryMutationsOptions) {
  const { confirm } = useConfirm();
  const { mutateAsync: addInventoryItem } = useAddInventoryItem();
  const { mutateAsync: addInventoryItems } = useAddInventoryItems();
  const { mutateAsync: updateInventoryItem } = useUpdateInventoryItem();
  const { mutateAsync: removeInventoryItem } = useRemoveInventoryItem();
  const { mutate: reorderInventoryItems } = useReorderInventoryItems();
  const { sendItemDrop, sendPlayerOffer } = useCampaignMessages();
  const { reportChatFailure } = useChatSendFailure();

  // ── Container picker ──────────────────────────────────────────────────────────
  const showContainerPicker = ref(false);
  const containerPickerSearch = ref("");

  const containerCandidates = computed(() => {
    const q = containerPickerSearch.value.trim().toLowerCase();
    return myItems.value
      .filter(
        (i) =>
          !i.is_container &&
          i.location !== "equipped" &&
          (!q || i.name.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  });

  async function promoteToContainer(item: PartyInventoryItem) {
    await updateInventoryItem({ id: item.id, update: { is_container: true } });
    showContainerPicker.value = false;
    containerPickerSearch.value = "";
  }

  // ── Vault item helpers ────────────────────────────────────────────────────────
  /** The full row behind a picked id: a held or projected one from `allItems`,
   *  a library one read by id. A custom id the projection lacks is not readable
   *  by a player, so it resolves to null rather than being fetched. */
  async function loadItem(itemId: string | null): Promise<Item | null> {
    if (!itemId) return null;
    const known = allItems.value?.find((it) => it.id === itemId);
    if (known) return known;
    if (isUuid(itemId)) return null;
    return (await fetchResolvedItem(itemId)).item;
  }

  function isContainerVaultItem(item: Item | null): boolean {
    return item?.tags.includes("container") ?? false;
  }

  // ── Basic mutations ───────────────────────────────────────────────────────────
  async function adjustQty(item: PartyInventoryItem, delta: number) {
    await updateInventoryItem({
      id: item.id,
      update: { quantity: Math.max(1, item.quantity + delta) },
    });
  }

  async function moveItem(
    item: PartyInventoryItem,
    toLocation: InventoryLocation | "stash",
    containerId: string | null,
  ) {
    const location: InventoryLocation =
      toLocation === "stash" ? "backpack" : toLocation;
    const carriedBy =
      toLocation === "stash" ? null : (resolvedMemberId.value ?? null);
    await updateInventoryItem({
      id: item.id,
      update: {
        location,
        container_id: containerId,
        carried_by: carriedBy,
        ...(location !== "equipped" ? { is_equipped: false, slot: null } : {}),
      },
    });
  }

  function handleReorder(items: PartyInventoryItem[]) {
    // Only write rows whose sort_order actually changes — in the steady state
    // (list already spaced i * 100) a single drag touches a handful of rows,
    // not the whole inventory, and each PATCH fans out to every client via
    // the realtime channel.
    const updates = items
      .map((item, i) => ({ id: item.id, sort_order: i * 100 }))
      .filter((u, i) => items[i].sort_order !== u.sort_order);
    if (updates.length > 0) reorderInventoryItems(updates);
  }

  async function removeItem(id: string) {
    const infusionHolder = (partyMembers.value ?? []).find((m) =>
      (m.active_infusions ?? []).some((a) => a.inv_item_id === id),
    );
    const message = infusionHolder
      ? `Remove this item? It is currently linked to an active infusion on ${infusionHolder.name}; that infusion link will be cleared automatically.`
      : "Remove this item?";
    if (!(await confirm(message))) return;
    await removeInventoryItem(id);
  }

  async function dropItemToChat(inv: PartyInventoryItem) {
    if (
      !(await confirm(
        `Drop "${inv.name}" to chat? It will be removed from your inventory.`,
      ))
    )
      return;
    const ref = inventoryItemRef(inv);
    const linkedItem = ref
      ? (allItems.value?.find((it) => it.id === ref) ?? null)
      : null;
    // Post first, remove after: a failed post must not cost the player the item.
    try {
      await sendItemDrop(
        inv.name,
        // `ref`, not `inv.item_id` — it is resolved two lines up and was then
        // ignored here. A library-sourced row keeps its reference in
        // `library_item_id`, so passing the raw column dropped it and the claim
        // landed as unlinked free text. Third instance of the same miss; the
        // other two were in PartyInventoryInline and NpcInventorySection.
        ref,
        inv.quantity,
        linkedItem?.rarity ?? null,
      );
    } catch (e) {
      reportChatFailure(e, "drop the item to the chat");
      return;
    }
    await removeInventoryItem(inv.id);
  }

  async function splitStack(inv: PartyInventoryItem) {
    const raw = window.prompt(
      `Split "${inv.name}": how many to split off? (1–${inv.quantity - 1})`,
      "1",
    );
    if (raw === null) return;
    const n = parseInt(raw, 10);
    if (!Number.isInteger(n) || n < 1 || n >= inv.quantity) {
      window.alert(`Enter a number between 1 and ${inv.quantity - 1}.`);
      return;
    }
    await updateInventoryItem({
      id: inv.id,
      update: { quantity: inv.quantity - n },
    });
    await addInventoryItem({
      name: inv.name,
      quantity: n,
      // Both halves keep whichever reference the original carried; copying only
      // item_id would quietly strip a library-referenced stack on every split.
      item_id: inv.item_id,
      library_item_id: inv.library_item_id,
      carried_by: inv.carried_by,
      location: inv.location,
      slot: inv.slot,
      is_container: inv.is_container,
      container_id: inv.container_id,
      is_ruined: inv.is_ruined,
      is_attuned: false,
      is_equipped: inv.is_equipped,
      notes: inv.notes,
      is_identified: inv.is_identified,
    });
  }

  async function addToLocation(
    location: PartyInventoryItem["location"],
    containerId: string | null,
    name: string,
    itemId: string | null,
  ) {
    const vaultItem = await loadItem(itemId);
    await addInventoryItem({
      name,
      quantity: 1,
      // The picker offers vault items and shared library content in one list,
      // and only the id's shape says which. Writing a library id into item_id
      // is the 22P02 of #815 — the whole catalogue was selectable and none of
      // it addable.
      ...itemRefColumns(itemId),
      carried_by: resolvedMemberId.value ?? null,
      location,
      slot: null,
      is_container: isContainerVaultItem(vaultItem),
      container_id: containerId,
      is_attuned: false,
      is_equipped: false,
      notes: null,
      is_ruined: false,
      // A player adding their own item already knows what it is. Items the DM hands
      // out still arrive unidentified.
      is_identified: true,
    });
  }

  async function addItem(selectedId: string, name: string, qty: number) {
    const vaultItem = await loadItem(selectedId || null);
    const bundleItems = vaultItem?.bundle_items;

    if (bundleItems && bundleItems.length > 0) {
      const packRow = await addInventoryItem({
        name,
        quantity: qty,
        ...itemRefColumns(vaultItem!.id),
        carried_by: resolvedMemberId.value ?? null,
        location: "backpack",
        slot: null,
        is_container: true,
        container_id: null,
        is_attuned: false,
        is_equipped: false,
        notes: null,
        is_ruined: false,
        is_identified: true,
      });
      // Each bundle part is matched by name in the slim list, then read in full.
      const subVaults = await Promise.all(
        bundleItems.map((sub) => {
          const entry = (catalogue.value ?? []).find(
            (i) => i.name.toLowerCase() === sub.name.toLowerCase(),
          );
          return loadItem(entry?.id ?? null);
        }),
      );
      await addInventoryItems(
        bundleItems.map((sub, i) => {
          const subVault = subVaults[i];
          return {
            name: sub.name,
            quantity: sub.quantity ?? 1,
            ...itemRefColumns(subVault?.id ?? null),
            carried_by: resolvedMemberId.value ?? null,
            location: "container" as const,
            slot: null,
            is_container: subVault?.tags.includes("container") ?? false,
            container_id: packRow.id,
            is_attuned: false,
            is_equipped: false,
            notes: null,
            is_ruined: false,
            is_identified: true,
          };
        }),
      );
    } else {
      await addInventoryItem({
        name,
        quantity: qty,
        ...itemRefColumns(selectedId || null),
        carried_by: resolvedMemberId.value ?? null,
        location: "backpack",
        slot: null,
        is_container: isContainerVaultItem(vaultItem),
        container_id: null,
        is_attuned: false,
        is_equipped: false,
        notes: null,
        is_ruined: false,
        // Self-added: identified, see addToLocation.
        is_identified: true,
      });
    }
  }

  // ── Item detail / sell / consume ──────────────────────────────────────────────
  async function handleConsume(id: string) {
    selectedInv.value = null;
    await removeInventoryItem(id);
  }

  async function handleSell(
    pp: number,
    gp: number,
    ep: number,
    sp: number,
    cp: number,
  ) {
    const inv = selectedInv.value;
    if (!inv || !member.value) return;
    try {
      await sendPlayerOffer(
        inv.name,
        // Resolved reference, not the raw `item_id` column — a library-sourced
        // row keeps its reference in `library_item_id`, and passing the column
        // directly silently dropped the link for shared-content offers (same
        // miss as `dropItemToChat` above).
        inventoryItemRef(inv),
        inv.id,
        inv.quantity,
        member.value.id,
        pp,
        gp,
        ep,
        sp,
        cp,
      );
    } catch (e) {
      reportChatFailure(e, "send the offer to the chat");
      return;
    }
    selectedInv.value = null;
  }

  return {
    showContainerPicker,
    containerPickerSearch,
    containerCandidates,
    promoteToContainer,
    adjustQty,
    moveItem,
    handleReorder,
    removeItem,
    dropItemToChat,
    splitStack,
    addToLocation,
    addItem,
    handleConsume,
    handleSell,
  };
}
