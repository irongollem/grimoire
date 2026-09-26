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
 */

import { computed, type ComputedRef, type Ref } from "vue";
import { useQueries } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { isUuid } from "@/lib/library/contentIdentity";
import { formatEntityEmbedBodyHtml } from "@/lib/scriptorium/scriptoriumImport";
import { entityRefKey, type EntityRef, type EntityEmbedLookup } from "@/lib/scriptorium/entityEmbeds";
import type { EntityEmbedType } from "@/lib/tiptap/entityEmbed";
import type { Npc } from "@/types/npc.types";
import type { Monster } from "@/types/monster.types";
import type { Spell } from "@/types/spell.types";
import type { Item } from "@/types/item.types";
import type { Location } from "@/types/location.types";
import type { Quest, QuestObjective } from "@/types/quest.types";
import type { ScriptoriumTheme } from "@/types/scriptorium.types";

// ── Minimal unscoped row fetchers ────────────────────────────────────────────

async function fetchNpcRow(id: string): Promise<Npc> {
  const { data, error } = await supabase.from("npcs").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Npc;
}

/** Mirrors useResolvedMonster: shared library row first, then the DM's own —
 *  library ids are non-UUID slugs, so guard the custom-table query with isUuid
 *  the same way useResolvedMonster does. */
async function fetchResolvedMonsterRow(id: string): Promise<Monster> {
  const { data: shared, error: sharedError } = await supabase
    .from("library_monsters")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (sharedError) throw sharedError;
  if (shared) return { ...shared, user_id: "", is_shared: true } as Monster;
  if (!isUuid(id)) throw new Error("Monster not found");
  const { data, error } = await supabase.from("monsters").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Monster;
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

  const monsters = useRowsById(monsterIds, "resolved-monster", fetchResolvedMonsterRow);
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
        const monster = monsters.byId.value.get(ref.id);
        return monster ? formatEntityEmbedBodyHtml({ type: "monster", monster }, theme.value) : undefined;
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
      spells.isLoading.value ||
      items.isLoading.value ||
      locations.isLoading.value ||
      quests.isLoading.value ||
      objectives.isLoading.value,
  );

  return { lookup, isLoading };
}
