import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";

const QUERY_KEY = "library-art-defaults";
const STALE_TIME = 1000 * 60 * 30; // 30 minutes — art changes rarely

type LibraryContentType = "spell" | "item";

export interface ArtDefaultEntry {
  image_url: string | null;
  image_focal_point: { x: number; y: number } | null;
}

// Keyed by "spell:fireball" or "item:ring of protection" (content_type:lower(name))
export type ArtDefaultsMap = Record<string, ArtDefaultEntry>;

async function fetchLibraryArtDefaults(): Promise<ArtDefaultsMap> {
  const { data, error } = await supabase
    .from("library_art_defaults")
    .select("content_type, content_name, image_url, image_focal_point");
  if (error) throw error;
  const map: ArtDefaultsMap = {};
  for (const row of data) {
    map[`${row.content_type}:${row.content_name}`] = {
      image_url: row.image_url,
      image_focal_point: row.image_focal_point ?? null,
    };
  }
  return map;
}

export interface LibraryArtDefaultStats {
  monsters: number;
  spells: number;
  items: number;
}

/**
 * Canonical art/defaults are unowned (#584) — there is no "my contributions"
 * to count anymore, so this reports the total published library size
 * (monsters/spells/items that currently have canonical art), not a per-user
 * count. The auth check just avoids four network calls for a signed-out
 * caller; RLS already requires auth.uid() on the canonical tables.
 */
async function fetchLibraryArtDefaultStats(): Promise<LibraryArtDefaultStats> {
  const user = getCurrentUser();
  if (!user) return { monsters: 0, spells: 0, items: 0 };

  const [monstersRes, spellsDefaultsRes, spellsArtRes, itemsRes] = await Promise.all([
    supabase.from("library_monster_art_canonical").select("*", { count: "exact", head: true }),
    supabase
      .from("library_art_defaults")
      .select("*", { count: "exact", head: true })
      .eq("content_type", "spell"),
    supabase.from("library_spell_art_canonical").select("*", { count: "exact", head: true }),
    supabase
      .from("library_art_defaults")
      .select("*", { count: "exact", head: true })
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

async function upsertArtDefaults(contentType: LibraryContentType, rows: ArtRow[]): Promise<void> {
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((r) => ({
      content_type: contentType,
      content_name: r.name.toLowerCase(),
      image_url: r.image_url,
      image_focal_point: r.image_focal_point ?? null,
    }));
    const { error } = await supabase
      .from("library_art_defaults")
      .upsert(batch, { onConflict: "content_type,content_name", ignoreDuplicates: false });
    if (error) throw error;
  }
}

async function bulkPublishLibraryArtDefaults(): Promise<LibraryArtDefaultStats> {
  const user = getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const [allSpells, allItems] = await Promise.all([fetchSpellsWithArt(), fetchItemsWithArt()]);

  await Promise.all([
    upsertArtDefaults("spell", allSpells),
    upsertArtDefaults("item", allItems),
  ]);

  return { monsters: 0, spells: allSpells.length, items: allItems.length };
}

export function useLibraryArtDefaults() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchLibraryArtDefaults,
    staleTime: STALE_TIME,
  });
}

export function useLibraryArtDefaultStats() {
  return useQuery({
    queryKey: [QUERY_KEY, "stats"],
    queryFn: fetchLibraryArtDefaultStats,
    staleTime: 0,
  });
}

export function useBulkPublishLibraryArtDefaults() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: bulkPublishLibraryArtDefaults,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

export function useSyncLibrarySpellArt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("sync_library_spell_art");
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library-spells"] });
    },
  });
}

export function useSyncLibraryItemArt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("sync_library_item_art");
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library-items"] });
    },
  });
}
