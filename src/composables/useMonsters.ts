import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { SRD_MONSTERS, getSrdMonster } from "@/data/srdMonsters";
import { useSrdMonsterArt } from "@/composables/useSrdMonsterArt";
import type { Monster, MonsterInsert, MonsterUpdate } from "@/types/monster.types";
import { removeStorageImages } from "@/composables/useImageUpload";

export { getSrdMonster };

const QUERY_KEY = "monsters";
const SOURCES_KEY = "monster-sources";
const OPEN5E_DOCS_KEY = "open5e-monster-documents";

async function fetchMonsters(): Promise<Monster[]> {
  const all: Monster[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("monsters")
      .select("*")
      .order("name", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    all.push(...(data as Monster[]));
    if ((data ?? []).length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function fetchMonster(id: string): Promise<Monster> {
  const { data, error } = await supabase.from("monsters").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Monster;
}

async function createMonster(monster: MonsterInsert): Promise<Monster> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("monsters")
    .insert({ ...monster, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as Monster;
}

async function updateMonster(id: string, update: MonsterUpdate): Promise<Monster> {
  const { data, error } = await supabase
    .from("monsters")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Monster;
}

async function deleteMonster(monster: Monster): Promise<void> {
  const { error } = await supabase.from("monsters").delete().eq("id", monster.id);
  if (error) throw error;
  await removeStorageImages("asset-images", monster.image_url, monster.card_art_url);
}

export function useMonsters() {
  return useQuery({ queryKey: [QUERY_KEY], queryFn: fetchMonsters, staleTime: Infinity });
}

/** Returns the static SRD bestiary + the user's custom and Open5e-imported
 *  monsters, sorted by name. Static SRD monsters are overlaid with any
 *  custom art the user has uploaded.
 *
 *  Dedupe rule: if a DB monster exists with the same name as a static one
 *  (e.g. the user imported `wotc-srd` via `useImportSrdMonsters`), the DB
 *  version wins. That way re-importing doesn't produce 322 duplicate
 *  "Aboleth" rows, and a user who edits an imported monster sees their
 *  edits instead of the read-only static fallback. */
export function useAllMonsters() {
  const query = useMonsters();
  const { data: artMap } = useSrdMonsterArt();
  const data = computed<Monster[]>(() => {
    const custom = query.data.value ?? [];
    const art = artMap.value ?? {};
    const dbNames = new Set(custom.map((m) => m.name));
    const srd = SRD_MONSTERS
      .filter((m) => !dbNames.has(m.name))
      .map((m) => {
        const a = art[m.id];
        return a
          ? { ...m, image_url: a.image_url, card_art_url: a.card_art_url, portrait_focal_point: a.portrait_focal_point, card_art_focal_point: a.card_art_focal_point }
          : m;
      });
    return [...srd, ...custom].sort((a, b) => a.name.localeCompare(b.name));
  });
  return { data, isLoading: query.isLoading };
}

export function useMonster(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id.value]),
    queryFn: () => fetchMonster(id.value),
    enabled: () => !!id.value,
  });
}

export function useCreateMonster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createMonster,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateMonster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: MonsterUpdate }) =>
      updateMonster(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeleteMonster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteMonster,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}


/** Clone an SRD monster into the user's own collection. Returns the new Monster. */
export function useCloneSrdMonster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (srdMonster: Monster): Promise<Monster> => {
      const { name, monster_type, size, alignment, habitat, source, tags, stat_block, notes, image_url, card_art_url } = srdMonster;
      return createMonster({ name, monster_type, size, alignment, habitat, source: `${source ?? "SRD 5.1"} (customized)`, tags, stat_block, notes, image_url, card_art_url });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

// ── Open5e runtime import ────────────────────────────────────────────────────

/** Distinct source slugs across the user's imported monsters — feeds the Source filter dropdown. */
export function useMonsterSources() {
  return useQuery({
    queryKey: [SOURCES_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monsters")
        .select("source, source_title")
        .eq("open5e_import", true);
      if (error) throw error;
      const seen = new Map<string, { slug: string; title: string }>();
      for (const row of (data ?? []) as Array<{ source: string | null; source_title: string | null }>) {
        if (row.source && !seen.has(row.source)) {
          seen.set(row.source, { slug: row.source, title: row.source_title ?? row.source });
        }
      }
      return Array.from(seen.values()).sort((a, b) => a.title.localeCompare(b.title));
    },
    staleTime: Infinity,
  });
}

/** Open5e documents (SRD, Tome of Beasts, Creature Codex, …). Shared endpoint
 *  with spells but keyed separately so each section's enabled state is local. */
export function useOpen5eMonsterDocuments(enabled: Ref<boolean>) {
  return useQuery({
    queryKey: [OPEN5E_DOCS_KEY],
    queryFn: async () => {
      const { fetchOpen5eDocuments } = await import("@/lib/open5eMonsterImport");
      return fetchOpen5eDocuments();
    },
    staleTime: Infinity,
    enabled,
  });
}

export type MonsterImportResult = { inserted: number; updated: number };

/**
 * Pulls all monsters from the selected Open5e documents and upserts them into
 * the `monsters` table as `open5e_import: true`. Matches the Spells pattern:
 * - Inserts by name (monsters are globally unique by name within Open5e).
 * - Updates existing open5e-imported rows in place when source / CR / stat
 *   block changes, WITHOUT touching user-uploaded art or custom notes.
 */
export function useImportSrdMonsters() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sourceSlugs: string[]): Promise<MonsterImportResult> => {
      const { fetchSrdMonsters } = await import("@/lib/open5eMonsterImport");
      const monsters = await fetchSrdMonsters(sourceSlugs.length > 0 ? sourceSlugs : undefined);
      const user = getCurrentUser();
      if (!user) throw new Error("Not authenticated");

      // ── Load existing open5e-imported monsters so we can dedupe + decide
      //    between insert and update ─────────────────────────────────────────
      const allNames = monsters.map((m) => m.name);
      type ExistingRow = {
        id: string;
        name: string;
        source: string | null;
        source_title: string | null;
        source_url: string | null;
        stat_block: MonsterInsert["stat_block"];
      };
      const existing: ExistingRow[] = [];
      const CHUNK = 200;
      for (let i = 0; i < allNames.length; i += CHUNK) {
        const { data } = await supabase
          .from("monsters")
          .select("id, name, source, source_title, source_url, stat_block")
          .eq("open5e_import", true)
          .in("name", allNames.slice(i, i + CHUNK));
        existing.push(...((data ?? []) as ExistingRow[]));
      }
      const existingMap = new Map(existing.map((e) => [e.name, e]));

      // ── Insert new monsters ───────────────────────────────────────────────
      const toInsert = monsters.filter((m) => !existingMap.has(m.name));
      const INSERT_BATCH = 100;
      for (let i = 0; i < toInsert.length; i += INSERT_BATCH) {
        const batch = toInsert
          .slice(i, i + INSERT_BATCH)
          .map((m) => ({ ...m, user_id: user.id }));
        const { error } = await supabase.from("monsters").insert(batch);
        if (error) throw error;
      }

      // ── Update existing monsters (source + stat block only, never art) ───
      const toUpdate = monsters.filter((m) => {
        const cur = existingMap.get(m.name);
        if (!cur) return false;
        const sameSource = cur.source === m.source;
        const sameTitle = cur.source_title === m.source_title;
        const sameUrl = cur.source_url === m.source_url;
        // Stat block comparison is a structural JSON compare; any change in
        // CR / damage / actions upstream re-syncs down to the DB.
        const sameStats = JSON.stringify(cur.stat_block) === JSON.stringify(m.stat_block);
        return !sameSource || !sameTitle || !sameUrl || !sameStats;
      });

      const UPDATE_CONCURRENCY = 25;
      for (let i = 0; i < toUpdate.length; i += UPDATE_CONCURRENCY) {
        await Promise.all(
          toUpdate.slice(i, i + UPDATE_CONCURRENCY).map((m) =>
            supabase
              .from("monsters")
              .update({
                source: m.source,
                source_title: m.source_title,
                source_url: m.source_url,
                monster_type: m.monster_type,
                size: m.size,
                alignment: m.alignment,
                stat_block: m.stat_block,
                is_srd: m.is_srd,
              })
              .eq("open5e_import", true)
              .eq("name", m.name),
          ),
        );
      }

      return { inserted: toInsert.length, updated: toUpdate.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [SOURCES_KEY] });
    },
  });
}
