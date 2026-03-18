import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { Item, ItemInsert, ItemUpdate } from "@/types/item.types";

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
  const user = await getCurrentUser();
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

export function useItems() {
  return useQuery({ queryKey: [QUERY_KEY], queryFn: fetchItems });
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
      const [apiItems] = await Promise.all([fetchSrdItems()]);
      const items = [...apiItems, ...MUNDANE_GEAR];

      // Check which names already exist — query only the names we're about to
      // insert (in chunks of 200) to avoid the default 1000-row Supabase limit
      // that would otherwise silently miss items and cause duplicates on re-import.
      const allNames = items.map((i) => i.name);
      const existingNames = new Set<string>();
      const NAME_CHUNK = 200;
      for (let i = 0; i < allNames.length; i += NAME_CHUNK) {
        const { data } = await supabase
          .from("items")
          .select("name")
          .eq("source", "srd")
          .in("name", allNames.slice(i, i + NAME_CHUNK));
        (data ?? []).forEach((r: { name: string }) => existingNames.add(r.name));
      }

      const toInsert = items.filter((i) => !existingNames.has(i.name));
      if (toInsert.length === 0) return 0;
      const user = await getCurrentUser();
      const withUser = toInsert.map((i) => ({ ...i, user_id: user!.id }));
      // Batch insert in groups of 100 to avoid request size limits
      const BATCH = 100;
      for (let i = 0; i < withUser.length; i += BATCH) {
        const { error } = await supabase.from("items").insert(withUser.slice(i, i + BATCH));
        if (error) throw error;
      }
      return toInsert.length;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
