import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed } from "vue";
import type { Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { Item } from "@/types/item.types";
import { usePlayerVisibleItems } from "@/composables/items/useItems";

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

/** The player-facing shape: `item` is resolved from the player-visible
 *  projection rather than an embedded RLS join (players cannot read `items`
 *  directly — see {@link usePlayerVisibleItems}), so it can genuinely be
 *  absent (row not yet reflected in the projection cache). `null` is a real,
 *  renderable state — not "still loading". */
export type PlayerStoreItem = Omit<StoreItem, "item"> & { item: Item | null };

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

/** Row-only fetch, no `item:items(*)` embed — the embed is dead weight for a
 *  player (RLS blocks the joined `items` read, so it always comes back null;
 *  see the projection note on {@link useSharedStoreItems}). */
async function fetchStoreItemRows(locationId: string): Promise<Omit<StoreItem, "item">[]> {
  const { data, error } = await supabase
    .from("store_items")
    .select("*")
    .eq("location_id", locationId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data as Omit<StoreItem, "item">[];
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

/**
 * Every store row in a set of locations, in one query (#764).
 *
 * `useStoreItems` is per-location, which is right for a shop's own page and
 * useless for a dashboard card that has to say something about *all* of them —
 * one query per store would be a request per shop in the campaign.
 *
 * `store_items` carries no `campaign_id`, only `location_id`, so the caller
 * supplies the ids it cares about (the campaign's store-type locations) and
 * this fetches their rows in a single `in` filter. RLS still scopes the read to
 * the owner, so a bad id list leaks nothing — it just returns fewer rows.
 *
 * Deliberately selects no embedded `item`: the dashboard counts stock and asks
 * whether any of it is visible, and joining the whole item row for a count is
 * the kind of query that is invisible in a fixture campaign and expensive in a
 * real one.
 */
export function useStoreStockCounts(locationIds: Ref<readonly string[]>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "stock-counts", [...locationIds.value].sort()]),
    queryFn: async (): Promise<StoreStockRow[]> => {
      const ids = locationIds.value;
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("store_items")
        .select("location_id, visible")
        .in("location_id", [...ids]);
      if (error) throw error;
      return data as StoreStockRow[];
    },
    enabled: () => locationIds.value.length > 0,
  });
}

/** The two columns `useStoreStockCounts` actually reads. */
export interface StoreStockRow {
  location_id: string;
  visible: boolean;
}

export function useStoreItems(locationId: Ref<string | undefined>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, locationId.value]),
    queryFn: () => fetchStoreItems(locationId.value!),
    enabled: () => !!locationId.value,
  });
}

/**
 * Player-facing store wares. `store_items` itself has member RLS (players can
 * select rows for a shared, visible location), but the embedded `items`
 * resource used by {@link useStoreItems} is RLS-blocked for players — the
 * join comes back null (migration 20260711000014 dropped the player select
 * policies on `items`). So this fetches the bare rows and resolves each
 * `item_id` against {@link usePlayerVisibleItems} instead, which shares its
 * DM-preview branch (full owned catalog) and real-player projection.
 *
 * A row's item can still legitimately resolve to `null` — the projection
 * cache (`staleTime: Infinity`, invalidate-only) can lag a `store_items`
 * write that just made a row visible. Callers must render that as an
 * explicit "not resolved yet" state, never coerce it.
 */
export function useSharedStoreItems(locationId: Ref<string | undefined>) {
  const rowsQuery = useQuery({
    queryKey: computed(() => [QUERY_KEY, locationId.value, "shared"]),
    queryFn: () => fetchStoreItemRows(locationId.value!),
    enabled: () => !!locationId.value,
  });
  const { data: visibleItems, isLoading: itemsLoading } = usePlayerVisibleItems();

  const data = computed<PlayerStoreItem[] | undefined>(() => {
    const rows = rowsQuery.data.value;
    if (!rows) return undefined;
    const byId = new Map((visibleItems.value ?? []).map((item) => [item.id, item]));
    return rows.map((row) => ({ ...row, item: byId.get(row.item_id) ?? null }));
  });
  const isLoading = computed(() => rowsQuery.isLoading.value || itemsLoading.value);

  return { ...rowsQuery, data, isLoading };
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
