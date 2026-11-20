// What the server reads of a fight's player characters (#1201, #1021): their sheets, the campaign's inventory rows they
// carry, the items those name and the Wild Shape forms they are in. Shared by `encounter-command` (which adjudicates
// against them and plays an ally from one) and `encounter-options` (which lists an ally's turn the same way).

import type { SupabaseClient } from "@supabase/supabase-js";
import { inventoryItemRef } from "../../../src/lib/itemRef.ts";
import { isUuid } from "../../../src/lib/library/contentIdentity.ts";
import { libraryMonsterRow } from "../../../src/lib/library/libraryMonsterRow.ts";
import { normalizeLibraryItem } from "../../../src/lib/items/normalizeLibraryItem.ts";
import type { PartyInventoryItem } from "../../../src/types/inventory.types.ts";
import type { Item } from "../../../src/types/item.types.ts";
import type { BeastScores, PlayerSheetRow, PlayerSheets } from "../../../src/rules/fight/playerSheet.ts";
import { loadCustomItems } from "./fightItems.ts";
import { customContentScope } from "./fightStatBlocks.ts";

export async function loadPlayerSheets(admin: SupabaseClient, campaignId: string, memberIds: string[]): Promise<PlayerSheets> {
  // Every read is scoped to this campaign. The inventory ids come from this campaign's own rows (a database
  // trigger keeps an inventory row's item in the same campaign or a global row its owner may use), and an
  // item is read only when it is this campaign's or its Dungeon Masters' own, so a forged id names nothing of another account's.
  const { data: members, error: memberError } = await admin
    .from("party_members")
    .select("id, ruleset, class, subclass, ac_formula, class_choices, str, dex, con, int, wis, cha, proficiency_bonus, saving_throw_proficiencies, wildshape_state, speed, level, custom_attacks")
    .eq("campaign_id", campaignId)
    .in("id", memberIds);
  if (memberError) throw new Error(`party_members: ${memberError.message}`);
  const { data: inventory, error: inventoryError } = await admin
    .from("party_inventory").select("*").eq("campaign_id", campaignId).in("carried_by", memberIds);
  if (inventoryError) throw new Error(`party_inventory: ${inventoryError.message}`);
  const rows = inventory as PartyInventoryItem[];
  const refs = [...new Set(rows.flatMap((r) => inventoryItemRef(r) ?? []))];
  const items: Item[] = [];
  const customIds = refs.filter(isUuid);
  const libraryIds = refs.filter((id) => !isUuid(id));
  if (customIds.length > 0) {
    items.push(...(await loadCustomItems(admin, campaignId, customIds)));
  }
  if (libraryIds.length > 0) {
    const { data, error } = await admin.from("library_items").select("*").in("id", libraryIds);
    if (error) throw new Error(`library_items: ${error.message}`);
    items.push(...data.map(normalizeLibraryItem));
  }
  // A Wild Shape form's STR, DEX and CON replace the character's own on a save.
  const formIds = [...new Set((members as PlayerSheetRow[]).flatMap((m) => m.wildshape_state?.monster_id ?? []))];
  const beasts: BeastScores[] = [];
  const libraryForms = formIds.filter((id) => !isUuid(id));
  const customForms = formIds.filter(isUuid);
  if (libraryForms.length > 0) {
    const { data, error } = await admin.from("library_monsters").select("*").in("id", libraryForms);
    if (error) throw new Error(`library_monsters: ${error.message}`);
    beasts.push(...data.map(libraryMonsterRow).map((m) => ({ id: m.id, stat_block: m.stat_block })));
  }
  if (customForms.length > 0) {
    const { data, error } = await admin
      .from("monsters").select("id, stat_block").in("id", customForms).or(await customContentScope(admin, campaignId));
    if (error) throw new Error(`monsters: ${error.message}`);
    beasts.push(...(data as BeastScores[]));
  }
  return { members: members as PlayerSheetRow[], inventory: rows, items, beasts };
}
