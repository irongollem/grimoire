/**
 * The names of the things a Scriptorium book links to, for the document import's book source (#1226 story 7).
 *
 * An `entityEmbed` carries a type and an id and no name, so a book taken apart reads it back through here: one
 * request per kind, scoped by the ids the chapters hold. Only kinds with a name column are read; a species or
 * a subclass link has no sensible heading and is dropped from the text. A shared-library creature, item or spell
 * has a text id and lives in its `library_*` table.
 */
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { isUuid } from "@/lib/library/contentIdentity";
import { entityRefKey, type EntityRef } from "@/scriptorium/lib/entityEmbeds";

/** Embed type → [campaign table, column, shared-library table or null]. */
const NAME_SOURCES: Partial<Record<EntityRef["type"], { table: string; column: string; libraryTable: string | null }>> = {
  npc: { table: "npcs", column: "name", libraryTable: null },
  monster: { table: "monsters", column: "name", libraryTable: "library_monsters" },
  spell: { table: "spells", column: "name", libraryTable: "library_spells" },
  item: { table: "items", column: "name", libraryTable: "library_items" },
  location: { table: "locations", column: "name", libraryTable: null },
  quest: { table: "quests", column: "title", libraryTable: null },
  deity: { table: "deities", column: "name", libraryTable: null },
  faction: { table: "factions", column: "name", libraryTable: null },
};

async function readNames(table: string, column: string, ids: string[]): Promise<{ id: string; name: string }[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.from(table).select(`id, ${column}`).in("id", ids);
  if (error) throw error;
  const out: { id: string; name: string }[] = [];
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const name = row[column];
    if (typeof row.id === "string" && typeof name === "string" && name.trim() !== "") out.push({ id: row.id, name });
  }
  return out;
}

/** `entityRefKey` → name, for every link a name was found for. A link to something since deleted has none. */
export async function fetchEmbedNames(refs: readonly EntityRef[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const reads: Promise<void>[] = [];
  for (const [type, source] of Object.entries(NAME_SOURCES) as [EntityRef["type"], NonNullable<(typeof NAME_SOURCES)[EntityRef["type"]]>][]) {
    const ofType = refs.filter((ref) => ref.type === type);
    const own = ofType.filter((ref) => isUuid(ref.id)).map((ref) => ref.id);
    const shared = ofType.filter((ref) => !isUuid(ref.id)).map((ref) => ref.id);
    const keep = (rows: { id: string; name: string }[]) => {
      for (const row of rows) names.set(entityRefKey({ type, id: row.id }), row.name);
    };
    reads.push(readNames(source.table, source.column, own).then(keep));
    if (source.libraryTable) reads.push(readNames(source.libraryTable, "name", shared).then(keep));
  }
  await Promise.all(reads);
  return names;
}

export function useBookEmbedNames(refs: MaybeRefOrGetter<readonly EntityRef[]>) {
  const key = computed(() => toValue(refs).map(entityRefKey).sort());
  return useQuery({
    queryKey: computed(() => ["book-import-embed-names", key.value] as const),
    queryFn: () => fetchEmbedNames(toValue(refs)),
    enabled: () => toValue(refs).length > 0,
  });
}
