import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import {
  DEFAULT_NPC_STARTER_INVENTORY_PACKS,
  type NpcStarterInventoryPack,
} from "@/lib/npcGenerator/inventorySets";

const SETTINGS_KEY = "npc_starter_inventory_packs";
export const NPC_STARTER_PACKS_QUERY_KEY = ["app_settings", SETTINGS_KEY] as const;

function cleanList(values: unknown): string[] | null {
  if (!Array.isArray(values)) return null;
  const result = new Map<string, string>();
  for (const value of values) {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (trimmed && !result.has(key)) result.set(key, trimmed);
  }
  return [...result.values()];
}

export function validateNpcStarterPacks(value: unknown): NpcStarterInventoryPack[] {
  if (!Array.isArray(value)) throw new Error("Starter packs must be a list.");
  const rows: unknown[] = value;
  const ids = new Set<string>();
  const packs: NpcStarterInventoryPack[] = [];
  for (const pack of rows) {
    if (typeof pack !== "object" || pack === null || Array.isArray(pack)
      || !("id" in pack) || typeof pack.id !== "string" || !pack.id || ids.has(pack.id)
      || !("label" in pack) || typeof pack.label !== "string"
      || !("cues" in pack) || !("items" in pack)) {
      throw new Error("Starter packs have invalid or duplicate entries.");
    }
    const label = pack.label.trim();
    if (!label) throw new Error("Give each starter pack a name.");
    const cues = cleanList(pack.cues);
    const items = cleanList(pack.items);
    if (!cues || !items) throw new Error(`Check the match cues and items for ${label}.`);
    if (pack.id !== "everyday" && !cues.length) throw new Error(`Add a match cue for ${label}.`);
    if (pack.id === "everyday" && cues.length) throw new Error("The fallback pack cannot have match cues.");
    ids.add(pack.id);
    packs.push({ id: pack.id, label, cues, items });
  }
  if (packs.at(-1)?.id !== "everyday") throw new Error("Keep the fallback pack at the end of the list.");
  return packs;
}

export async function fetchNpcStarterPacks(): Promise<readonly NpcStarterInventoryPack[]> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  if (error) throw error;
  return data ? validateNpcStarterPacks(data.value) : DEFAULT_NPC_STARTER_INVENTORY_PACKS;
}

export function useNpcStarterPacks(enabled?: () => boolean) {
  return useQuery({
    queryKey: NPC_STARTER_PACKS_QUERY_KEY,
    queryFn: fetchNpcStarterPacks,
    enabled: computed(() => enabled?.() ?? true),
  });
}
