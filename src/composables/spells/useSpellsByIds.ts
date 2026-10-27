import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { normaliseIds, useRowsByIds } from "@/composables/useRowsByIds";
import { supabase } from "@/lib/supabase";
import type { Spell } from "@/types/spell.types";
import { isUuid } from "@/lib/library/contentIdentity";

const CHUNK = 100;

function chunked<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/**
 * Full spell rows for exactly these ids. Ids are opaque: every id is tried
 * against `library_spells`, and the UUID-shaped ones also against `spells`.
 * No source, ruleset or scope filter: a character's spell is shown whether or
 * not its source is currently enabled. Empty input sends nothing.
 */
export async function fetchSpellsByIds(ids: readonly string[]): Promise<Map<string, Spell>> {
  const allIds = normaliseIds(ids);
  return fetchNormalised(allIds, allIds.filter(isUuid));
}

async function fetchNormalised(libraryIds: string[], customIds: string[]): Promise<Map<string, Spell>> {
  const [libraryRows, customRows] = await Promise.all([
    Promise.all(chunked(libraryIds).map(async (chunk) => {
      const { data, error } = await supabase.from("library_spells").select("*").in("id", chunk);
      if (error) throw error;
      return data ?? [];
    })),
    Promise.all(chunked(customIds).map(async (chunk) => {
      const { data, error } = await supabase.from("spells").select("*").in("id", chunk);
      if (error) throw error;
      return data ?? [];
    })),
  ]);

  const map = new Map<string, Spell>();
  for (const row of libraryRows.flat()) map.set(row.id, { ...row, user_id: "" } as Spell);
  // A custom row wins over a library row with the same id, as before.
  for (const row of customRows.flat()) map.set(row.id, row as Spell);
  return map;
}

export function useSpellsByIds(ids: MaybeRefOrGetter<readonly string[]>) {
  const all = computed(() => normaliseIds(toValue(ids)));
  return useRowsByIds<Spell>({
    keyRoot: ["spells", "by-ids"],
    idLists: () => [all.value, all.value.filter(isUuid)],
    fetch: ([libraryIds, customIds]) => fetchNormalised(libraryIds, customIds),
  });
}
