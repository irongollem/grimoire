import { ref, computed, type Ref, type ComputedRef } from "vue";
import { useConfirm } from "@/composables/useConfirm";
import {
  useAddInventoryItem,
  useAddInventoryItems,
  useUpdateInventoryItem,
  useRemoveInventoryItem,
  useReorderInventoryItems,
} from "@/composables/items/usePartyInventory";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import type {
  PartyInventoryItem,
  InventoryLocation,
} from "@/types/inventory.types";
import type { Item } from "@/types/item.types";
import type { PartyMember } from "@/types/party.types";

interface UseInventoryMutationsOptions {
  resolvedMemberId: ComputedRef<string | null | undefined>;
  member: ComputedRef<PartyMember | null>;
  myItems: ComputedRef<PartyInventoryItem[]>;
  allItems: ComputedRef<Item[] | undefined>;
  partyMembers: ComputedRef<PartyMember[] | undefined>;
  selectedInv: Ref<PartyInventoryItem | null>;
}

export function useInventoryMutations({
  resolvedMemberId,
  member,
  myItems,
  allItems,
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
  function isContainerVaultItem(itemId: string | null): boolean {
    if (!itemId) return false;
    return (
      allItems.value
        ?.find((it) => it.id === itemId)
        ?.tags.includes("container") ?? false
    );
  }

  function isMagicVaultItem(itemId: string | null): boolean {
    if (!itemId) return false;
    const item = (allItems.value ?? []).find((i) => i.id === itemId);
    return !!item && item.rarity !== "mundane";
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
      ? `Remove this item? It is currently linked to an active infusion on ${infusionHolder.name} — that infusion link will be cleared automatically.`
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
    const linkedItem = inv.item_id
      ? (allItems.value?.find((it) => it.id === inv.item_id) ?? null)
      : null;
    await sendItemDrop(
      inv.name,
      inv.item_id,
      inv.quantity,
      linkedItem?.rarity ?? null,
    );
    await removeInventoryItem(inv.id);
  }

  async function splitStack(inv: PartyInventoryItem) {
    const raw = window.prompt(
      `Split "${inv.name}" — how many to split off? (1–${inv.quantity - 1})`,
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
      item_id: inv.item_id,
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
    await addInventoryItem({
      name,
      quantity: 1,
      item_id: itemId,
      carried_by: resolvedMemberId.value ?? null,
      location,
      slot: null,
      is_container: isContainerVaultItem(itemId),
      container_id: containerId,
      is_attuned: false,
      is_equipped: false,
      notes: null,
      is_ruined: false,
      is_identified: !isMagicVaultItem(itemId),
    });
  }

  async function addItem(selectedId: string, name: string, qty: number) {
    const vaultItem =
      (allItems.value ?? []).find((i) => i.id === selectedId) ?? null;
    const bundleItems = vaultItem?.bundle_items;

    if (bundleItems && bundleItems.length > 0) {
      const packRow = await addInventoryItem({
        name,
        quantity: qty,
        item_id: vaultItem!.id,
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
      await addInventoryItems(
        bundleItems.map((sub) => {
          const subVault =
            (allItems.value ?? []).find(
              (i) => i.name.toLowerCase() === sub.name.toLowerCase(),
            ) ?? null;
          return {
            name: sub.name,
            quantity: sub.quantity ?? 1,
            item_id: subVault?.id ?? null,
            carried_by: resolvedMemberId.value ?? null,
            location: "container" as const,
            slot: null,
            is_container: subVault?.tags.includes("container") ?? false,
            container_id: packRow.id,
            is_attuned: false,
            is_equipped: false,
            notes: null,
            is_ruined: false,
            is_identified: !subVault || subVault.rarity === "mundane",
          };
        }),
      );
    } else {
      await addInventoryItem({
        name,
        quantity: qty,
        item_id: selectedId || null,
        carried_by: resolvedMemberId.value ?? null,
        location: "backpack",
        slot: null,
        is_container: isContainerVaultItem(selectedId || null),
        container_id: null,
        is_attuned: false,
        is_equipped: false,
        notes: null,
        is_ruined: false,
        is_identified: !isMagicVaultItem(selectedId || null),
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
    await sendPlayerOffer(
      inv.name,
      inv.item_id,
      inv.id,
      inv.quantity,
      member.value.id,
      pp,
      gp,
      ep,
      sp,
      cp,
    );
    selectedInv.value = null;
  }

  return {
    showContainerPicker,
    containerPickerSearch,
    containerCandidates,
    promoteToContainer,
    isContainerVaultItem,
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
