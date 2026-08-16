import { computed, isRef } from "vue";
import type { Ref, ComputedRef } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { storeToRefs } from "pinia";
import { supabase, getCurrentUser } from "@/lib/supabase";
import type { Item, ItemInsert, ItemUpdate } from "@/types/item.types";
import { deleteByPublicUrl } from "@/lib/storage";
import { useLibraryArtDefaults } from "@/composables/useLibraryArtDefaults";
import { useLibrarySourceSlugs } from "@/composables/useEnabledSources";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import { useToast } from "@/composables/useToast";
import { isUuid } from "@/lib/library/contentIdentity";
import { mergeLibraryWithCustom } from "@/lib/library/libraryShadow";
import { useRuleset } from "@/composables/useRuleset";
import type { RulesetKey } from "@/types/ruleset.types";

interface ItemSource {
  slug: string;
  title: string | null;
}

const QUERY_KEY = "items";
const LIBRARY_QUERY_KEY = "library-items";
const UNIQUE_VIOLATION = "23505";

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

/** Exported so a resolved downtime outcome can mint a seed item into the campaign. */
export async function createItem(item: ItemInsert): Promise<Item> {
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

async function fetchLibraryItems(enabledSlugs: string[], ruleset: RulesetKey): Promise<Item[]> {
  // Edition-neutral grimoire-bundled gear is always visible; enabled campaign
  // sources add to it. Array-form `.in()` (not a string-interpolated
  // `.or(...in.(...))`) keeps slug values from ever being parsed as PostgREST
  // filter syntax, and a single-element list handles the no-enabled-sources case.
  const { data, error } = await supabase
    .from("library_items")
    .select("*")
    .in("source_document_key", ["grimoire-bundled", ...enabledSlugs])
    .or(`ruleset.is.null,ruleset.eq.${ruleset}`)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    user_id: "",
    campaign_id: null,
    dm_notes: null,
    // library_items carries no spell_ids column — the field only exists on
    // user-authored items with linked spells (e.g. a homebrew staff).
    spell_ids: [],
  })) as Item[];
}


/** Distinct item sources — derived from the merged {@link useItems} catalog so
 *  campaign-enabled library_items sources surface in the Vault "Source" filter
 *  alongside any custom-item sources. */
export function useItemSources() {
  const { data: items, isLoading } = useItems();
  const data = computed<ItemSource[]>(() => {
    const list = items.value ?? [];
    const map = new Map<string, string | null>();
    for (const item of list) {
      if (!item.source) continue;
      if (!map.has(item.source) || item.source_title) map.set(item.source, item.source_title ?? null);
    }
    return [...map.entries()]
      .map(([slug, title]) => ({ slug, title }))
      .sort((a, b) => (a.title ?? a.slug).localeCompare(b.title ?? b.slug));
  });
  return { data, isLoading };
}

export interface UseItemsOptions {
  /** When true, return all items regardless of campaign scope. Default false: filtered to general + active campaign. */
  includeAllScopes?: boolean;
  /** Set false to hold the fetch back — for callers mounted permanently (e.g. the
   *  chat widget) that only need the catalogue once their panel is actually open.
   *  The full item catalogue plus the SRD item table is multiple MB; pulling it on
   *  every page load for a closed panel is pure egress. Defaults to true. */
  enabled?: boolean;
}

export function useItems(getOptions?: () => UseItemsOptions) {
  const isEnabled = () => getOptions?.().enabled !== false;
  const itemsQuery = useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchItems,
    staleTime: Infinity,
    enabled: isEnabled,
  });
  const artDefaults = useLibraryArtDefaults();
  const { activeCampaignId } = storeToRefs(useCampaignStore());
  const { ruleset } = useRuleset();
  const { slugs: enabledSlugs, isLoading: sourcesLoading } = useLibrarySourceSlugs();

  const libraryQuery = useQuery({
    queryKey: computed(() => [LIBRARY_QUERY_KEY, enabledSlugs.value, ruleset.value]),
    queryFn: () => fetchLibraryItems(enabledSlugs.value!, ruleset.value),
    enabled: () => isEnabled() && enabledSlugs.value !== null,
    staleTime: Infinity,
  });

  const data = computed(() => {
    const items = itemsQuery.data.value;
    const defaults = artDefaults.data.value;
    if (!items) return items;
    const opts = getOptions?.() ?? {};
    // library_items rows are already server-filtered by ruleset — this edition
    // filter is only load-bearing for the custom side, but it's harmless to
    // re-apply once merged below.
    const editionFiltered = items.filter((item) => !item.ruleset || item.ruleset === ruleset.value);
    const scopeFiltered = opts.includeAllScopes
      ? editionFiltered
      : editionFiltered.filter((i) => i.campaign_id === null || i.campaign_id === activeCampaignId.value);
    const merged = mergeLibraryWithCustom(libraryQuery.data.value ?? [], scopeFiltered);
    if (!defaults) return merged;
    return merged.map((item) => {
      if (item.image_url || !item.source) return item;
      const d = defaults[`item:${item.name.toLowerCase()}`];
      if (!d?.image_url) return item;
      return { ...item, image_url: d.image_url, image_focal_point: d.image_focal_point };
    });
  });

  const isLoading = computed(
    () => itemsQuery.isLoading.value || sourcesLoading.value || libraryQuery.isLoading.value,
  );

  return { ...itemsQuery, data, isLoading };
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
  const artDefaults = useLibraryArtDefaults();
  const { activeCampaignId } = storeToRefs(useCampaignStore());
  const { ruleset } = useRuleset();
  // Players can read campaign_enabled_sources directly (RLS allows any
  // campaign member select), so the same enabled-sources → library_items query
  // used by the DM catalog works unchanged here.
  const { slugs: enabledSlugs, isLoading: sourcesLoading } = useLibrarySourceSlugs();

  const libraryQuery = useQuery({
    queryKey: computed(() => [LIBRARY_QUERY_KEY, enabledSlugs.value, ruleset.value]),
    queryFn: () => fetchLibraryItems(enabledSlugs.value!, ruleset.value),
    enabled: () => enabledSlugs.value !== null,
    staleTime: Infinity,
  });

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
    sourcesLoading.value ||
    libraryQuery.isLoading.value ||
    (ui.dmPreviewMode ? baseQuery.isLoading.value : projectionQuery.isLoading.value),
  );

  const data = computed(() => {
    const items = rawItems.value;
    const defaults = artDefaults.data.value;
    if (!items) return items;
    const opts = getOptions?.() ?? {};
    const editionFiltered = items.filter((item) => !item.ruleset || item.ruleset === ruleset.value);
    const scopeFiltered = opts.includeAllScopes
      ? editionFiltered
      : editionFiltered.filter((i) => i.campaign_id === null || i.campaign_id === activeCampaignId.value);
    const merged = mergeLibraryWithCustom(libraryQuery.data.value ?? [], scopeFiltered);
    if (!defaults) return merged;
    return merged.map((item) => {
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

/**
 * Queue this item for semantic-search embedding (#602) so the loot-table
 * generator's retrieval can find it without waiting for the next admin
 * backfill.
 *
 * Fire-and-forget on purpose, exactly like queueNpcEmbedding: the item is
 * already saved, so a failed embed is not worth a toast, a spinner or a
 * delayed mutation — the row simply stays unembedded and the next backfill
 * sweep collects it. The edge function short-circuits when the embed text's
 * hash is unchanged, so a save that only touched art or dm_notes costs no API
 * call at all.
 *
 * Custom items only. `library_items` is embedded by the admin batch
 * (embed-content, entity "library_item"), which is why there is no
 * queueLibraryItemEmbedding — shared content has no per-user write path.
 */
export function queueItemEmbedding(id: string): void {
  void supabase.functions
    .invoke("embed-content", { body: { mode: "single", entity: "item", id } })
    .catch(() => { /* non-fatal — see above */ });
}

export function useCreateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createItem,
    onSuccess: (item) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queueItemEmbedding(item.id);
    },
  });
}

export function useUpdateItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: ItemUpdate }) => updateItem(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
      queueItemEmbedding(id);
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

/** Resolve an opaque item ID against explicit shared/custom stores — mirrors
 *  {@link useResolvedMonster}/`useResolvedSpell`. */
export function useResolvedItem(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => ["resolved-item", id.value]),
    queryFn: async () => {
      // library_items ids are text slugs, custom items are uuids — the two id
      // spaces are disjoint, so branch on the id shape and do a single lookup
      // rather than always probing library_items first (the common owned-item
      // detail page is a uuid and would otherwise pay a guaranteed-miss query).
      if (isUuid(id.value)) {
        const item = await fetchItem(id.value);
        if (!item) throw new Error("Item not found");
        return { item, isShared: false };
      }
      const { data: shared, error: sharedError } = await supabase
        .from("library_items").select("*").eq("id", id.value).maybeSingle();
      if (sharedError) throw sharedError;
      if (!shared) throw new Error("Item not found");
      return {
        item: { ...shared, user_id: "", campaign_id: null, dm_notes: null, spell_ids: [] } as Item,
        isShared: true,
      };
    },
    enabled: () => !!id.value,
  });
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e
    && (e as { code?: unknown }).code === UNIQUE_VIOLATION;
}

/**
 * Bridges text-slug library_items ids and the uuid FK columns that reference the
 * user's `items` table (store_items, party_inventory, recipes, npc_inventory,
 * loot tables, …): every FK-bearing write path must own a real `items` row, so
 * a picker calls this before persisting a reference. A uuid `Item` (already
 * user-owned, custom or previously cloned) passes through unchanged; an srd
 * slug row is cloned into the user's own `items` table on first reference —
 * the clone then shadows the shared row in every merged {@link useItems} list
 * (same source identity), so no duplicate appears afterwards.
 */
export function useEnsureOwnedItem() {
  const queryClient = useQueryClient();

  async function ensureOwnedItem(item: Item): Promise<Item> {
    if (isUuid(item.id)) return item;

    const user = getCurrentUser();
    if (!user) throw new Error("Not authenticated");
    if (!item.source_document_key || !item.source_record_key) {
      throw new Error("SRD item is missing source identity");
    }

    const findExisting = async (): Promise<Item | null> => {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("user_id", user.id)
        .eq("source_document_key", item.source_document_key as string)
        .eq("source_record_key", item.source_record_key as string)
        .maybeSingle();
      if (error) throw error;
      return data as Item | null;
    };

    const existing = await findExisting();
    if (existing) return existing;

    const payload: ItemInsert = {
      name: item.name,
      item_type: item.item_type,
      subtype: item.subtype,
      rarity: item.rarity,
      requires_attunement: item.requires_attunement,
      attunement_requirements: item.attunement_requirements,
      weight: item.weight,
      cost: item.cost,
      damage_rolls: item.damage_rolls,
      armor_class: item.armor_class,
      properties: item.properties,
      mastery: item.mastery,
      charges: item.charges,
      recharge: item.recharge,
      spell_ids: item.spell_ids,
      weapon_range: item.weapon_range,
      versatile_damage: item.versatile_damage,
      description: item.description,
      source: item.source,
      source_title: item.source_title,
      source_url: item.source_url,
      tags: item.tags,
      bundle_items: item.bundle_items,
      image_url: item.image_url,
      image_focal_point: item.image_focal_point,
      is_arcane_focus: item.is_arcane_focus,
      curse_description: item.curse_description,
      mundane_description: item.mundane_description,
      mundane_image_url: item.mundane_image_url,
      mundane_image_focal_point: item.mundane_image_focal_point,
      campaign_id: null,
      dm_notes: null,
      ruleset: item.ruleset,
      conceptual_key: item.conceptual_key,
      source_document_key: item.source_document_key,
      source_record_key: item.source_record_key,
      source_revision: item.source_revision,
      source_license: item.source_license,
      provenance: item.provenance,
    };

    try {
      const created = await createItem(payload);
      // Embed the clone even though its library twin is already embedded and
      // the text is byte-identical (#602). The two are not interchangeable for
      // retrieval: the library row is only reachable while its source stays
      // enabled for the campaign, and a DM who disables that book afterwards
      // keeps the clone in their vault. Without this the item would be visible
      // in the Vault but invisible to loot retrieval. Duplicate names across
      // the two corpora are handled by the custom-wins dedup in
      // _shared/itemRetrieval.ts.
      queueItemEmbedding(created.id);
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      return created;
    } catch (e) {
      // Two concurrent pickers can race to clone the same srd item — the
      // loser hits the (user_id, source_document_key, source_record_key)
      // unique index; re-query for the winner's row instead of failing.
      if (isUniqueViolation(e)) {
        const retried = await findExisting();
        if (retried) return retried;
      }
      throw e;
    }
  }

  return { ensureOwnedItem };
}
