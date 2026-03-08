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

async function fetchItem(id: string): Promise<Item> {
  const { data, error } = await supabase.from("items").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Item;
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
}
