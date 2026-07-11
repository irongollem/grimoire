import { computed, isRef } from "vue";
import type { Ref, ComputedRef } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { storeToRefs } from "pinia";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { Item, ItemInsert, ItemUpdate } from "@/types/item.types";
import { deleteByPublicUrl } from "@/lib/storage";
import { useSrdArtDefaults } from "@/composables/useSrdArtDefaults";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import { useToast } from "@/composables/useToast";

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

async function deleteItem(item: Item): Promise<void> {
  const { error } = await supabase.from("items").delete().eq("id", item.id);
  if (error) throw error;
  await deleteByPublicUrl(item.image_url, item.mundane_image_url);
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

export interface UseItemsOptions {
  /** When true, return all items regardless of campaign scope. Default false: filtered to general + active campaign. */
  includeAllScopes?: boolean;
}

export function useItems(getOptions?: () => UseItemsOptions) {
  const itemsQuery = useQuery({ queryKey: [QUERY_KEY], queryFn: fetchItems, staleTime: Infinity });
  const artDefaults = useSrdArtDefaults();
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  const data = computed(() => {
    const items = itemsQuery.data.value;
    const defaults = artDefaults.data.value;
    if (!items) return items;
    const opts = getOptions?.() ?? {};
    const scopeFiltered = opts.includeAllScopes
      ? items
      : items.filter((i) => i.campaign_id === null || i.campaign_id === activeCampaignId.value);
    if (!defaults) return scopeFiltered;
    return scopeFiltered.map((item) => {
      if (item.image_url || !item.source) return item;
      const d = defaults[`item:${item.name.toLowerCase()}`];
      if (!d?.image_url) return item;
      return { ...item, image_url: d.image_url, image_focal_point: d.image_focal_point };
    });
  });

  return { ...itemsQuery, data };
}

/** Player-visible items (their vault + shared store items) via the
 *  get_player_visible_items SECURITY DEFINER projection (migration
 *  20260711000014), with `dm_notes` nulled. Players have no direct base-table
 *  read path (RLS is owner-only). Drop-in replacement for {@link useItems} on
 *  every player surface — same art-defaults merge + campaign-scope filtering. */
async function fetchPlayerVisibleItems(): Promise<Item[]> {
  const { data, error } = await supabase.rpc("get_player_visible_items");
  if (error) throw error;
  return (data ?? []) as Item[];
}

export function usePlayerVisibleItems(getOptions?: () => UseItemsOptions) {
  const ui = useUiStore();
  const artDefaults = useSrdArtDefaults();
  const { activeCampaignId } = storeToRefs(useCampaignStore());

  // Real player → gated projection. DM preview → full owned catalog (the DM
  // isn't a campaign_member, so the projection returns nothing; the DM owns the
  // rows and needs them to resolve inventory item details). Shares the base
  // `[QUERY_KEY]` cache with useItems.
  const projectionQuery = useQuery({
    queryKey: [QUERY_KEY, "player-visible"],
    queryFn: fetchPlayerVisibleItems,
    enabled: () => !ui.dmPreviewMode,
    staleTime: Infinity,
  });
  const baseQuery = useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchItems,
    enabled: () => ui.dmPreviewMode,
    staleTime: Infinity,
  });
  const rawItems = computed(() =>
    ui.dmPreviewMode ? baseQuery.data.value : projectionQuery.data.value,
  );
  const isLoading = computed(() =>
    ui.dmPreviewMode ? baseQuery.isLoading.value : projectionQuery.isLoading.value,
  );

  const data = computed(() => {
    const items = rawItems.value;
    const defaults = artDefaults.data.value;
    if (!items) return items;
    const opts = getOptions?.() ?? {};
    const scopeFiltered = opts.includeAllScopes
      ? items
      : items.filter((i) => i.campaign_id === null || i.campaign_id === activeCampaignId.value);
    if (!defaults) return scopeFiltered;
    return scopeFiltered.map((item) => {
      if (item.image_url || !item.source) return item;
      const d = defaults[`item:${item.name.toLowerCase()}`];
      if (!d?.image_url) return item;
      return { ...item, image_url: d.image_url, image_focal_point: d.image_focal_point };
    });
  });

  return { data, isLoading };
}

export function useItem(id: Ref<string> | ComputedRef<string> | string) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, isRef(id) ? id.value : id]),
    queryFn: () => fetchItem(isRef(id) ? id.value : id),
    enabled: () => !!(isRef(id) ? id.value : id),
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
  const toast = useToast();
  return useMutation({
    mutationFn: deleteItem,
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: [QUERY_KEY, id] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

export function useImportSrdItems() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { fetchSrdItems } = await import("@/lib/open5eImport");
      const { GEAR } = await import("@/data/gear");
      const { PROVISIONS } = await import("@/data/provisions");
      const { SERVICES } = await import("@/data/services");
      const { AMMUNITION } = await import("@/data/ammunition");
      const apiItems = await fetchSrdItems();
      const items = [...apiItems, ...GEAR, ...PROVISIONS, ...SERVICES, ...AMMUNITION];

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
          ...item,
          user_id: user!.id,
        }));
        const { error } = await supabase.from("items").insert(batch);
        if (error) throw error;
      }

      // Update existing items: refresh source fields + tags.
      // Preserves user-added data (image_url, image_focal_point, description).
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
                tags: item.tags,
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
