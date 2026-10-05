/*
 * Fetches the CURRENT data behind a document's `entityEmbed` refs and formats
 * each into body HTML (#915 story 3), for the live editor galley, the paged
 * preview, the PDF export and the read-only Scriptorium renderer.
 *
 * Every fetch here is UNSCOPED by id and mirrors the single-row fetch its
 * sibling composable already performs (useNpc / useResolvedMonster / useSpell /
 * useItem / useLocation / useQuest), reusing their exact query keys so
 * TanStack Query's cache is shared rather than duplicated — an entity already
 * loaded elsewhere in the app resolves here with no extra network round trip.
 * That duplication (rather than importing those composables directly) is
 * necessary rather than sloppy: this composable fetches a REACTIVE, variable-
 * length list of ids per type, and `useQuery` cannot be called a variable
 * number of times from a loop the way a fixed set of composables can —
 * `useQueries` is TanStack's own answer to that, and it wants its own
 * queryFn per entry.
 *
 * Scriptorium documents are DM-only (owner-RLS on scriptorium_documents), so
 * every read below resolves the DM's own row regardless of the currently
 * active campaign — the same "resolve an already-stored id unscoped" rule
 * #597 established for monster references.
 *
 * Secondary joins the formatters want (an NPC's location name, a quest's
 * giver + location names + objectives, an item's granted spells) are resolved
 * in a second pass once the primary rows are in, using the SAME query keys —
 * so a location referenced both directly and as a join target is fetched once.
 *
 * A shared (library) monster's row comes back as-stored, with no DM art
 * override applied — `fetchResolvedMonsterRow` mirrors `useResolvedMonster`,
 * not `useMonsterWithArt`. #917 story 1 closed that gap: the DM's merged art
 * layers (`useLibraryMonsterArt.ts`'s canonical+own merge, `withLibraryArt`)
 * are fetched here too, under the exact same query key, and applied onto a
 * shared monster before formatting — a DM's own monster is untouched, since
 * its art already lives on its own row.
 */

import { computed, type ComputedRef, type Ref } from "vue";
import { useQueries, useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { isUuid } from "@/lib/library/contentIdentity";
import { formatEntityEmbedBodyHtml } from "@/lib/scriptorium/scriptoriumImport";
import {
  fetchLibraryMonsterArtEntries,
  withLibraryArt,
  LIBRARY_MONSTER_ART_STALE_TIME,
} from "@/composables/library/useLibraryMonsterArt";
import { entityRefKey, type EntityRef, type EntityEmbedLookup } from "@/lib/scriptorium/entityEmbeds";
import type { EntityEmbedType } from "@/lib/tiptap/entityEmbed";
import type { Npc } from "@/types/npc.types";
import type { Spell } from "@/types/spell.types";
import type { Item } from "@/types/item.types";
import type { Location } from "@/types/location.types";
import type { Quest, QuestObjective } from "@/types/quest.types";
import type { ScriptoriumTheme } from "@/types/scriptorium.types";
import { fetchResolvedMonster, RESOLVED_MONSTER_QUERY_KEY } from "@/composables/monsters/useMonsters";

// ── Minimal unscoped row fetchers ────────────────────────────────────────────

async function fetchNpcRow(id: string): Promise<Npc> {
  const { data, error } = await supabase.from("npcs").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Npc;
}

async function fetchSpellRow(id: string): Promise<Spell> {
  const { data, error } = await supabase.from("spells").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Spell;
}

async function fetchItemRow(id: string): Promise<Item | null> {
  const { data, error } = await supabase.from("items").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Item | null;
}

async function fetchLocationRow(id: string): Promise<Location> {
  const { data, error } = await supabase.from("locations").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Location;
}

async function fetchQuestRow(id: string): Promise<Quest> {
  const { data, error } = await supabase.from("quests").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Quest;
}

async function fetchQuestObjectivesRow(questId: string): Promise<QuestObjective[]> {
  const { data, error } = await supabase
    .from("quest_objectives")
    .select("*")
    .eq("quest_id", questId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data as QuestObjective[];
}

/** Batch-fetch a variable, reactive list of ids under one query-key prefix,
 *  returning a lookup by id and a combined loading flag. `ids` is a getter so
 *  the query array can depend on other reactive state (a prior batch's
 *  results) without this composable calling `useQuery` a variable number of
 *  times. */
function useRowsById<T>(ids: () => string[], keyPrefix: string, fetcher: (id: string) => Promise<T>) {
  const results = useQueries({
    queries: () =>
      ids().map((id) => ({
        queryKey: [keyPrefix, id] as const,
        queryFn: () => fetcher(id),
      })),
  });

  const byId = computed(() => {
    const currentIds = ids();
    const map = new Map<string, T>();
    currentIds.forEach((id, i) => {
      const row = results.value[i]?.data as T | undefined;
      if (row !== undefined && row !== null) map.set(id, row);
    });
    return map;
  });

  const isLoading = computed(() => results.value.some((r) => r.isLoading));

  return { byId, isLoading };
}

function uniqueIds(values: Iterable<string | null | undefined>): string[] {
  return [...new Set([...values].filter((v): v is string => !!v))];
}

export interface UseEntityEmbedDataOptions {
  /** Governs the ability-score table layout npc/monster embeds render with. */
  theme?: Ref<ScriptoriumTheme> | ComputedRef<ScriptoriumTheme>;
}

export interface UseEntityEmbedDataResult {
  /** {type,id} ref key -> the entity's current, formatted body HTML (unsanitized). */
  lookup: ComputedRef<EntityEmbedLookup>;
  isLoading: ComputedRef<boolean>;
}

export function useEntityEmbedData(
  refs: Ref<EntityRef[]> | ComputedRef<EntityRef[]>,
  options: UseEntityEmbedDataOptions = {},
): UseEntityEmbedDataResult {
  const theme = computed(() => options.theme?.value ?? "onednd2024");

  function idsOfType(type: EntityEmbedType): () => string[] {
    return () => uniqueIds(refs.value.filter((r) => r.type === type).map((r) => r.id));
  }

  const monsterIds = idsOfType("monster");
  const spellIdsFromRefs = idsOfType("spell");
  const itemIdsFn = idsOfType("item");
  const locationIdsFromRefs = idsOfType("location");
  const questIdsFn = idsOfType("quest");
  const npcIdsFromRefs = idsOfType("npc");

  // The Bestiary's own fetch and key (useMonsters.ts), so the cache entry has
  // one shape whichever side fills it first.
  const monsters = useRowsById(monsterIds, RESOLVED_MONSTER_QUERY_KEY, fetchResolvedMonster);
  // The art of just the embedded library monsters, under the same
  // `library-monster-art/entries` key the by-id readers use, so an art write's
  // prefix invalidation reaches it. A DM's own monster carries its art on its
  // row, so only library ids (text, not uuid) are asked for. Disabled when
  // there are none.
  const libraryMonsterIds = computed(() => monsterIds().filter((id) => !isUuid(id)).sort());
  const libraryArt = useQuery({
    queryKey: computed(() => ["library-monster-art", "entries", libraryMonsterIds.value] as const),
    queryFn: ({ queryKey: [, , ids] }) => fetchLibraryMonsterArtEntries(ids),
    staleTime: LIBRARY_MONSTER_ART_STALE_TIME,
    enabled: () => libraryMonsterIds.value.length > 0,
  });
  const items = useRowsById(itemIdsFn, "items", fetchItemRow);
  const quests = useRowsById(questIdsFn, "quests", fetchQuestRow);
  const objectives = useRowsById(questIdsFn, "quest_objectives", fetchQuestObjectivesRow);

  // Quests reference a giver NPC — folded into the same npc id set so a giver
  // that is ALSO directly embedded resolves from one fetch, not two.
  const npcIds = () =>
    uniqueIds([
      ...npcIdsFromRefs(),
      ...[...quests.byId.value.values()].map((q) => q.giver_npc_id),
    ]);
  const npcs = useRowsById(npcIds, "npcs", fetchNpcRow);

  // NPCs and quests both reference a location by name.
  const locationIds = () =>
    uniqueIds([
      ...locationIdsFromRefs(),
      ...[...npcs.byId.value.values()].map((n) => n.location_id),
      ...[...quests.byId.value.values()].map((q) => q.location_id),
    ]);
  const locations = useRowsById(locationIds, "locations", fetchLocationRow);

  // Items reference the spells they grant.
  const spellIds = () =>
    uniqueIds([
      ...spellIdsFromRefs(),
      ...[...items.byId.value.values()].flatMap((i) => i?.spell_ids ?? []),
    ]);
  const spells = useRowsById(spellIds, "spells", fetchSpellRow);

  function bodyHtmlFor(ref: EntityRef): string | undefined {
    switch (ref.type) {
      case "npc": {
        const npc = npcs.byId.value.get(ref.id);
        if (!npc) return undefined;
        const locationName = npc.location_id ? (locations.byId.value.get(npc.location_id)?.name ?? null) : null;
        return formatEntityEmbedBodyHtml({ type: "npc", npc, locationName }, theme.value);
      }
      case "monster": {
        const monster = monsters.byId.value.get(ref.id)?.monster;
        if (!monster) return undefined;
        // fetchResolvedMonsterRow only sets is_shared on a library row — a
        // DM's own monster carries its art in its own image_url/cutout_url
        // already, same as useMonsterWithArt's rule (useMonsters.ts).
        const withArt = monster.is_shared ? withLibraryArt(monster, libraryArt.data.value?.[ref.id]) : monster;
        return formatEntityEmbedBodyHtml({ type: "monster", monster: withArt }, theme.value);
      }
      case "spell": {
        const spell = spells.byId.value.get(ref.id);
        return spell ? formatEntityEmbedBodyHtml({ type: "spell", spell }) : undefined;
      }
      case "item": {
        const item = items.byId.value.get(ref.id);
        if (!item) return undefined;
        const itemSpells = (item.spell_ids ?? [])
          .map((id) => spells.byId.value.get(id))
          .filter((s): s is Spell => !!s);
        return formatEntityEmbedBodyHtml({ type: "item", item, spells: itemSpells });
      }
      case "location": {
        const location = locations.byId.value.get(ref.id);
        return location ? formatEntityEmbedBodyHtml({ type: "location", location }) : undefined;
      }
      case "quest": {
        const quest = quests.byId.value.get(ref.id);
        if (!quest) return undefined;
        const questObjectives = objectives.byId.value.get(ref.id) ?? [];
        const giverName = quest.giver_npc_id ? (npcs.byId.value.get(quest.giver_npc_id)?.name ?? null) : null;
        const locationName = quest.location_id
          ? (locations.byId.value.get(quest.location_id)?.name ?? null)
          : null;
        return formatEntityEmbedBodyHtml({
          type: "quest",
          quest,
          objectives: questObjectives,
          giverName,
          locationName,
        });
      }
    }
  }

  const lookup = computed<EntityEmbedLookup>(() => {
    const out: EntityEmbedLookup = {};
    for (const ref of refs.value) {
      out[entityRefKey(ref)] = bodyHtmlFor(ref);
    }
    return out;
  });

  const isLoading = computed(
    () =>
      npcs.isLoading.value ||
      monsters.isLoading.value ||
      libraryArt.isLoading.value ||
      spells.isLoading.value ||
      items.isLoading.value ||
      locations.isLoading.value ||
      quests.isLoading.value ||
      objectives.isLoading.value,
  );

  return { lookup, isLoading };
}
