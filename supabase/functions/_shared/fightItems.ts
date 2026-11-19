// The custom items a fight's player sheets are worked out from (armour class, saves). The service-role client bypasses
// RLS, so the read is kept in the query to this campaign's own items and its Dungeon Masters' (`customContentScope`):
// an inventory row names its item by id, and an id must never reach another account's private item.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Item } from "../../../src/types/item.types.ts";
import { customContentScope } from "./fightStatBlocks.ts";

/** Custom items (uuid ids) by id, kept to this campaign's scope. Errors are thrown, never read as "no item". */
export async function loadCustomItems(admin: SupabaseClient, campaignId: string, ids: string[]): Promise<Item[]> {
  if (ids.length === 0) return [];
  const { data, error } = await admin.from("items").select("*").in("id", ids).or(await customContentScope(admin, campaignId));
  if (error) throw new Error(`items: ${error.message}`);
  return data as Item[];
}
