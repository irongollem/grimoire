import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed } from "vue";
import type { Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { Item } from "@/types/item.types";

export interface StoreItem {
  id: string;
  user_id: string;
  location_id: string;
  item_id: string;
  price_override: string | null;
  visible: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  item: Item;
}

export interface StoreItemInsert {
  location_id: string;
  item_id: string;
  price_override?: string | null;
  visible?: boolean;
  sort_order?: number;
}

export interface StoreItemUpdate {
  price_override?: string | null;
  visible?: boolean;
  sort_order?: number;
}

const QUERY_KEY = "store-items";

async function fetchStoreItems(locationId: string): Promise<StoreItem[]> {
  const { data, error } = await supabase
    .from("store_items")
    .select("*, item:items(*)")
    .eq("location_id", locationId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data as StoreItem[];
}

async function addStoreItem(insert: StoreItemInsert): Promise<StoreItem> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("store_items")
    .insert({ ...insert, user_id: user!.id })
    .select("*, item:items(*)")
    .single();
  if (error) throw error;
  return data as StoreItem;
}

async function updateStoreItem(id: string, update: StoreItemUpdate): Promise<StoreItem> {
  const { data, error } = await supabase
    .from("store_items")
    .update(update)
    .eq("id", id)
    .select("*, item:items(*)")
    .single();
  if (error) throw error;
  return data as StoreItem;
}

async function removeStoreItem(id: string): Promise<void> {
  const { error } = await supabase.from("store_items").delete().eq("id", id);
  if (error) throw error;
}

export function useStoreItems(locationId: Ref<string | undefined>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, locationId.value]),
    queryFn: () => fetchStoreItems(locationId.value!),
    enabled: () => !!locationId.value,
  });
}

export function useSharedStoreItems(locationId: Ref<string | undefined>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, locationId.value, "shared"]),
    queryFn: () => fetchStoreItems(locationId.value!),
    enabled: () => !!locationId.value,
  });
}

export function useAddStoreItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addStoreItem,
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, vars.location_id] });
    },
  });
}

/**
 * Bulk insert in a single request. Quick-fill previously fired one POST per
 * item (up to 99 concurrent), which jammed the connection pool and timed out
 * the store query. Duplicates are silently skipped via the
 * (location_id, item_id) unique constraint so filling against a stale view
 * is harmless.
 */
async function addStoreItems(inserts: StoreItemInsert[]): Promise<void> {
  const user = getCurrentUser();
  const rows = inserts.map((i) => ({ ...i, user_id: user!.id }));
  const { error } = await supabase
    .from("store_items")
    .upsert(rows, { onConflict: "location_id,item_id", ignoreDuplicates: true });
  if (error) throw error;
}

export function useAddStoreItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addStoreItems,
    onSuccess: (_data, vars) => {
      if (vars.length > 0) {
        queryClient.invalidateQueries({ queryKey: [QUERY_KEY, vars[0].location_id] });
      }
    },
  });
}

export function useUpdateStoreItem(locationId: Ref<string | undefined>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: StoreItemUpdate }) =>
      updateStoreItem(id, update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, locationId.value] });
    },
  });
}

export function useRemoveStoreItem(locationId: Ref<string | undefined>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeStoreItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, locationId.value] });
    },
  });
}
