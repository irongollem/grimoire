import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { Item, ItemInsert, ItemUpdate } from "@/types/item.types";

interface ItemSource {
  slug: string;
  title: string | null;
}

const QUERY_KEY = "items";

async function fetchItems(): Promise<Item[]> {
  const all: Item[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("items")
      .select("*")
      .order("name", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    all.push(...(data as Item[]));
    if ((data ?? []).length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function fetchItem(id: string): Promise<Item | null> {
  const { data, error } = await supabase.from("items").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Item | null;
}

async function createItem(item: ItemInsert): Promise<Item> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("items")
    .insert({ ...item, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as Item;
}

async function updateItem(id: string, update: ItemUpdate): Promise<Item> {
  const { data, error } = await supabase
    .from("items")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Item;
}

async function deleteItem(id: string): Promise<void> {
  const { error } = await supabase.from("items").delete().eq("id", id);
  if (error) throw error;
}

async function fetchItemSources(): Promise<ItemSource[]> {
  const all: { source: string; source_title: string | null }[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("items")
      .select("source, source_title")
      .not("source", "is", null)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    all.push(...(data as { source: string; source_title: string | null }[]));
    if ((data ?? []).length < PAGE) break;
    offset += PAGE;
  }
  // Deduplicate by slug, preferring a non-null title
  const map = new Map<string, string | null>();
  for (const r of all) {
    if (!map.has(r.source) || r.source_title) map.set(r.source, r.source_title);
  }
  return [...map.entries()]
    .map(([slug, title]) => ({ slug, title }))
    .sort((a, b) => (a.title ?? a.slug).localeCompare(b.title ?? b.slug));
}

const SOURCES_KEY = "item-sources";

export function useItemSources() {
  return useQuery({ queryKey: [SOURCES_KEY], queryFn: fetchItemSources, staleTime: Infinity });
}

export function useItems() {
  return useQuery({ queryKey: [QUERY_KEY], queryFn: fetchItems, staleTime: Infinity });
}

export function useItem(id: string) {
  return useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: () => fetchItem(id),
    enabled: !!id,
  });
}

export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createItem,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}

export function useUpdateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: ItemUpdate }) => updateItem(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
    },
  });
}

export function useDeleteItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteItem,
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: [QUERY_KEY, id] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
}

export function useImportSrdItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { fetchSrdItems } = await import("@/lib/open5eImport");
      const { MUNDANE_GEAR } = await import("@/data/mundaneGear");
      const { SERVICES } = await import("@/data/services");
      const apiItems = await fetchSrdItems();
      const items = [...apiItems, ...MUNDANE_GEAR, ...SERVICES];

      // Check which names already exist — match by name only (no source filter)
      // so that re-imports correctly find previously imported items regardless of
      // what source value they were stored with.
      const allNames = items.map((i) => i.name);
      const existingByName = new Map<string, string>(); // name → id
      const NAME_CHUNK = 200;
      for (let i = 0; i < allNames.length; i += NAME_CHUNK) {
        const { data } = await supabase
          .from("items")
          .select("id, name")
          .in("name", allNames.slice(i, i + NAME_CHUNK));
        (data ?? []).forEach((r: { id: string; name: string }) => existingByName.set(r.name, r.id));
      }

      const user = getCurrentUser();
      const toInsert = items.filter((i) => !existingByName.has(i.name));
      const toUpdate = items.filter((i) => existingByName.has(i.name));

      // Insert new items in batches of 100
      const BATCH = 100;
      for (let i = 0; i < toInsert.length; i += BATCH) {
        const batch = toInsert.slice(i, i + BATCH).map((item) => ({
          curse_description: null,
          curse_revealed: false,
          ...item,
          user_id: user!.id,
        }));
        const { error } = await supabase.from("items").insert(batch);
        if (error) throw error;
      }

      // Update existing items: refresh source fields + new structural fields only.
      // Preserves user-added data (image_url, image_focal_point, tags, description).
      const UPDATE_BATCH = 50;
      for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH) {
        await Promise.all(
          toUpdate.slice(i, i + UPDATE_BATCH).map((item) =>
            supabase
              .from("items")
              .update({
                source: item.source,
                source_title: item.source_title ?? null,
                source_url: item.source_url ?? null,
                weapon_range: item.weapon_range ?? null,
                versatile_damage: item.versatile_damage ?? null,
              })
              .eq("id", existingByName.get(item.name)!),
          ),
        );
      }

      return toInsert.length;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [SOURCES_KEY] });
    },
  });
}
