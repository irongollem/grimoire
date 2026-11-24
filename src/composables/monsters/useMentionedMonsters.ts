import { computed, type ComputedRef } from "vue";
import { keepPreviousData, useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { fetchLibraryMonsterArtEntries } from "@/composables/library/useLibraryMonsterArt";
import { isUuid } from "@/lib/library/contentIdentity";
import { mentionedMonsterIds, type SceneMonster } from "@/ai/sceneEntities";

/** Under the "monsters" root so a monster edit's prefix invalidation reaches it. */
const MENTIONED_KEY = ["monsters", "mentioned"] as const;
const CHUNK = 100;

/** The monsters a scene or chronicle text @-mentions, by id: name, lore and
 *  picture, nothing else. The bestiary index carries none of the three, and the
 *  whole bestiary is 2 MB to read two fields of a handful of rows.
 *
 *  Library rows are read from `library_monsters` (the lore lives there, and a
 *  by-id row elsewhere carries none) with the art tables' picture laid over the
 *  row's own, the same precedence `withLibraryArt` applies. A DM's own rows come
 *  from `monsters`. No source, ruleset or campaign filter: the ids come from the
 *  index, which already scoped them. */
export async function fetchMentionedMonsters(ids: readonly string[]): Promise<Map<string, SceneMonster>> {
  const libraryIds = ids.filter((id) => !isUuid(id));
  const customIds = ids.filter(isUuid);
  const out = new Map<string, SceneMonster>();

  for (let start = 0; start < libraryIds.length; start += CHUNK) {
    const chunk = libraryIds.slice(start, start + CHUNK);
    const [rows, art] = await Promise.all([
      supabase.from("library_monsters").select("id, name, description, image_url").in("id", chunk),
      fetchLibraryMonsterArtEntries(chunk),
    ]);
    if (rows.error) throw rows.error;
    for (const row of rows.data) {
      out.set(row.id, {
        name: row.name,
        description: row.description,
        image_url: art[row.id]?.image_url ?? row.image_url,
      });
    }
  }
  for (let start = 0; start < customIds.length; start += CHUNK) {
    const { data, error } = await supabase
      .from("monsters")
      .select("id, name, description, image_url")
      .in("id", customIds.slice(start, start + CHUNK));
    if (error) throw error;
    for (const row of data) out.set(row.id, { name: row.name, description: row.description, image_url: row.image_url });
  }
  return out;
}

/** The mentioned monsters in index order (the order `parseSceneEntities` has
 *  always resolved a fuzzy @name in), read by id only once the text names one.
 *  `loading` is true while that by-id read is on its way, so a caller that must
 *  not resolve against nothing (an Ask quote) can wait for it. `rows` and `fetching` are
 *  for a caller that reads several texts at once: with `keepPrevious` the rows already
 *  read stay while a grown id set loads, so each text can ask whether ITS ids are in. */
export function useMentionedMonstersState(
  text: () => string,
  monsterIndex: () => readonly { id: string; name: string }[] | undefined,
  options?: { keepPrevious?: boolean },
): {
  monsters: ComputedRef<SceneMonster[]>;
  loading: ComputedRef<boolean>;
  rows: ComputedRef<ReadonlyMap<string, SceneMonster> | undefined>;
  fetching: ComputedRef<boolean>;
  failed: ComputedRef<boolean>;
} {
  const ids = computed(() => {
    const index = monsterIndex();
    return index ? mentionedMonsterIds(text(), index) : [];
  });
  const sortedIds = computed(() => [...ids.value].sort());
  const query = useQuery({
    queryKey: computed(() => [...MENTIONED_KEY, sortedIds.value] as const),
    queryFn: ({ queryKey: [, , wanted] }) => fetchMentionedMonsters(wanted),
    enabled: () => sortedIds.value.length > 0,
    ...(options?.keepPrevious ? { placeholderData: keepPreviousData } : {}),
  });
  const monsters = computed(() => {
    const rows = query.data.value;
    if (!rows) return [];
    return ids.value.flatMap((id) => {
      const row = rows.get(id);
      return row ? [row] : [];
    });
  });
  const loading = computed(() => sortedIds.value.length > 0 && query.data.value === undefined && !query.isError.value);
  return {
    monsters,
    loading,
    rows: computed(() => query.data.value),
    fetching: computed(() => query.isFetching.value),
    failed: computed(() => query.isError.value),
  };
}

export function useMentionedMonsters(
  text: () => string,
  monsterIndex: () => readonly { id: string; name: string }[] | undefined,
): ComputedRef<SceneMonster[]> {
  return useMentionedMonstersState(text, monsterIndex).monsters;
}
