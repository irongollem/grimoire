import { ref, computed } from "vue";
import { supabase } from "@/lib/supabase";
import { CLASS_EQUIPMENT } from "@/data/classEquipment";
import type { CharacterFormState } from "@/rules/characterCreation";
import type { BundleItemEntry } from "@/types/item.types";
import type { PartyInventoryInsert, PartyInventoryItem } from "@/types/inventory.types";

/** Vault item data needed for equipment seeding. */
export interface VaultEntry { id: string; bundle_items: BundleItemEntry[] | null }

type AddInventoryItem = (item: Omit<PartyInventoryInsert, "campaign_id">) => Promise<PartyInventoryItem>;
type AddInventoryItems = (items: Omit<PartyInventoryInsert, "campaign_id">[]) => Promise<void>;

interface EquipmentSeedingDeps {
  addInventoryItem: AddInventoryItem;
  addInventoryItems: AddInventoryItems;
}

/**
 * Class starting-equipment state and seeding logic for the character creation
 * wizard: which of the class's two starting bundles to grant, whether to
 * import it (and the background's) into inventory on creation, and the
 * vault-lookup + insert logic that turns a bundle/list into party_inventory
 * rows (see save() in useCharacterCreationForm, which is the sole caller of
 * seedEquipmentEntry/lookupVaultItems).
 */
export function useCharacterEquipmentSeeding(
  f: CharacterFormState,
  { addInventoryItem, addInventoryItems }: EquipmentSeedingDeps,
) {
  // Whether to import the chosen background's equipment text into inventory
  // on creation. Defaults to true so new characters don't end up empty-handed;
  // the player can untick it on the Background step.
  const importBackgroundEquipment = ref(true);

  // Class starting equipment: choice A or B, and whether to seed inventory.
  const classEquipmentChoice = ref<"a" | "b">("a");
  const importClassEquipment = ref(true);

  /** The two equipment bundles for the currently chosen class (null if class has no data). */
  const classEquipmentPack = computed(() => f.class ? (CLASS_EQUIPMENT[f.class] ?? null) : null);

  /** Look up vault items by name (case-insensitive). Returns Map<lowercaseName, VaultEntry>. */
  async function lookupVaultItems(names: string[]): Promise<Map<string, VaultEntry>> {
    if (names.length === 0) return new Map();
    const filter = names.map(n => `name.ilike.${n}`).join(",");
    const { data } = await supabase.from("items").select("id, name, bundle_items").or(filter);
    const map = new Map<string, VaultEntry>();
    for (const row of data ?? []) {
      map.set((row.name as string).toLowerCase(), {
        id: row.id as string,
        bundle_items: row.bundle_items as BundleItemEntry[] | null,
      });
    }
    return map;
  }

  /**
   * Seed one equipment entry into party_inventory.
   * If the vault item is a pack (has bundle_items), the pack itself becomes an
   * is_container=true row and each sub-item is inserted with container_id pointing to it.
   */
  async function seedEquipmentEntry(
    entry: { name: string; quantity?: number },
    vaultMap: Map<string, VaultEntry>,
    carrierId: string,
  ): Promise<void> {
    const vault = vaultMap.get(entry.name.toLowerCase()) ?? null;
    const bundleItems = vault?.bundle_items;

    if (bundleItems && bundleItems.length > 0) {
      // Pack: insert the pack itself as a container
      const packRow = await addInventoryItem({
        item_id: vault!.id, name: entry.name, quantity: entry.quantity ?? 1,
        carried_by: carrierId, location: "backpack",
        slot: null, is_container: true, container_id: null,
        is_attuned: false, is_equipped: false, notes: null,
        current_charges: null, is_identified: true, is_ruined: false, sort_order: 0,
      });
      // Look up the sub-items and batch-insert them inside the pack
      const subNames = [...new Set(bundleItems.map(b => b.name))];
      const subMap = await lookupVaultItems(subNames);
      await addInventoryItems(
        bundleItems.map((sub) => {
          const subVault = subMap.get(sub.name.toLowerCase()) ?? null;
          return {
            item_id: subVault?.id ?? null, name: sub.name, quantity: sub.quantity ?? 1,
            carried_by: carrierId, location: "container" as const,
            slot: null, is_container: false, container_id: packRow.id,
            is_attuned: false, is_equipped: false, notes: null,
            current_charges: null, is_identified: true, is_ruined: false, sort_order: 0,
          };
        }),
      );
    } else {
      // Plain item
      await addInventoryItem({
        item_id: vault?.id ?? null, name: entry.name, quantity: entry.quantity ?? 1,
        carried_by: carrierId, location: "backpack",
        slot: null, is_container: false, container_id: null,
        is_attuned: false, is_equipped: false, notes: null,
        current_charges: null, is_identified: true, is_ruined: false, sort_order: 0,
      });
    }
  }

  return {
    importBackgroundEquipment,
    classEquipmentChoice, importClassEquipment, classEquipmentPack,
    lookupVaultItems, seedEquipmentEntry,
  };
}
