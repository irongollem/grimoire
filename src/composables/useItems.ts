import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { Item, ItemInsert, ItemUpdate } from "@/types/item.types";

const QUERY_KEY = "items";

async function fetchItems(): Promise<Item[]> {
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data as Item[];
}

async function fetchItem(id: string): Promise<Item | null> {
  const { data, error } = await supabase.from("items").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Item | null;
}

async function createItem(item: ItemInsert): Promise<Item> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
      // Check which names already exist with source='srd'
      const { data: existing } = await supabase
        .from("items")
        .select("name")
        .eq("source", "srd");
      const existingNames = new Set((existing ?? []).map((r: { name: string }) => r.name));
      const toInsert = items.filter((i) => !existingNames.has(i.name));
      if (toInsert.length === 0) return 0;
      const {
        data: { user },
      } = await supabase.auth.getUser();
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
