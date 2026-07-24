import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";

const QUERY_KEY = "srd-art-defaults";
const STALE_TIME = 1000 * 60 * 30; // 30 minutes — art changes rarely

type SrdContentType = "spell" | "item";

export interface ArtDefaultEntry {
  image_url: string | null;
  image_focal_point: { x: number; y: number } | null;
}

// Keyed by "spell:fireball" or "item:ring of protection" (content_type:lower(name))
export type ArtDefaultsMap = Record<string, ArtDefaultEntry>;

async function fetchSrdArtDefaults(): Promise<ArtDefaultsMap> {
  const { data, error } = await supabase
    .from("srd_art_defaults")
    .select("content_type, srd_slug, image_url, image_focal_point");
  if (error) throw error;
  const map: ArtDefaultsMap = {};
  for (const row of data) {
    map[`${row.content_type}:${row.srd_slug}`] = {
      image_url: row.image_url,
      image_focal_point: row.image_focal_point ?? null,
    };
  }
  return map;
}

export interface SrdArtDefaultStats {
  monsters: number;
  spells: number;
  items: number;
}

async function fetchSrdArtDefaultStats(): Promise<SrdArtDefaultStats> {
  const user = getCurrentUser();
  if (!user) return { monsters: 0, spells: 0, items: 0 };

  const [monstersRes, spellsDefaultsRes, spellsArtRes, itemsRes] = await Promise.all([
    supabase
      .from("srd_monster_art")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_canonical", true),
    supabase
      .from("srd_art_defaults")
      .select("*", { count: "exact", head: true })
      .eq("contributed_by", user.id)
      .eq("content_type", "spell"),
    supabase
      .from("srd_spell_art")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_canonical", true),
    supabase
      .from("srd_art_defaults")
      .select("*", { count: "exact", head: true })
      .eq("contributed_by", user.id)
      .eq("content_type", "item"),
  ]);

  if (monstersRes.error) throw monstersRes.error;
  if (spellsDefaultsRes.error) throw spellsDefaultsRes.error;
  if (spellsArtRes.error) throw spellsArtRes.error;
  if (itemsRes.error) throw itemsRes.error;

  return {
    monsters: monstersRes.count ?? 0,
    spells: (spellsDefaultsRes.count ?? 0) + (spellsArtRes.count ?? 0),
    items: itemsRes.count ?? 0,
  };
}

type ArtRow = { name: string; image_url: string; image_focal_point: { x: number; y: number } | null };

async function fetchSpellsWithArt(): Promise<ArtRow[]> {
  const all: ArtRow[] = [];
  const PAGE = 500;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("spells")
      .select("name, image_url, image_focal_point")
      .eq("open5e_import", true)
      .not("image_url", "is", null)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    all.push(...(data as ArtRow[]));
    if ((data ?? []).length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function fetchItemsWithArt(): Promise<ArtRow[]> {
  const all: ArtRow[] = [];
  const PAGE = 500;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("items")
      .select("name, image_url, image_focal_point")
      .not("source", "is", null)
      .not("image_url", "is", null)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    all.push(...(data as ArtRow[]));
    if ((data ?? []).length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function upsertArtDefaults(userId: string, contentType: SrdContentType, rows: ArtRow[]): Promise<void> {
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((r) => ({
      contributed_by: userId,
      content_type: contentType,
      srd_slug: r.name.toLowerCase(),
      image_url: r.image_url,
      image_focal_point: r.image_focal_point ?? null,
    }));
    const { error } = await supabase
      .from("srd_art_defaults")
      .upsert(batch, { onConflict: "content_type,srd_slug", ignoreDuplicates: false });
    if (error) throw error;
  }
}

async function bulkPublishSrdArtDefaults(): Promise<SrdArtDefaultStats> {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const [allSpells, allItems] = await Promise.all([fetchSpellsWithArt(), fetchItemsWithArt()]);

  await Promise.all([
    upsertArtDefaults(user.id, "spell", allSpells),
    upsertArtDefaults(user.id, "item", allItems),
  ]);

  return { monsters: 0, spells: allSpells.length, items: allItems.length };
}

export function useSrdArtDefaults() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchSrdArtDefaults,
    staleTime: STALE_TIME,
  });
}

export function useSrdArtDefaultStats() {
  return useQuery({
    queryKey: [QUERY_KEY, "stats"],
    queryFn: fetchSrdArtDefaultStats,
    staleTime: 0,
  });
}

export function useBulkPublishSrdArtDefaults() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: bulkPublishSrdArtDefaults,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

export function useSyncSrdSpellArtToSharedTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("sync_srd_spell_art_to_shared_table");
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["srd-spells"] });
    },
  });
}

export function useSyncSrdItemArtToSharedTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("sync_srd_item_art_to_shared_table");
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["srd-items"] });
    },
  });
}
