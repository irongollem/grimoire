import { reportHandledError } from "@/lib/observability/sentry";
import { computed, isRef } from "vue";
import type { Ref, ComputedRef } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { createIdBatcher } from "@/lib/batchById";
import type { Item, ItemInsert, ItemUpdate } from "@/types/item.types";
import { deleteUnreferencedByPublicUrl } from "@/lib/storage";
import { useUiStore } from "@/stores/ui";
import { useToast } from "@/composables/useToast";
import { isUuid } from "@/lib/library/contentIdentity";

const QUERY_KEY = "items";
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

/**
 * One chat drop per row, each asking for its own item: batched so a screen of
 * twenty drops sends one `.in("id", ids)` request. The per-id query keys are
 * untouched; only the network is coalesced. A missing row is still `null`.
 */
const itemBatcher = createIdBatcher<Item>({
  fetchMany: async (ids) => {
    const { data, error } = await supabase.from("items").select("*").in("id", ids);
    if (error) throw error;
    return data as Item[];
  },
  idOf: (item) => item.id,
});

function fetchItem(id: string): Promise<Item | null> {
  return itemBatcher.load(id);
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
  // #917: a same-account campaign copy (copyToCampaign's buildCopyPlan) or a
  // cloneItem() duplicate can point at this same image_url/mundane_image_url —
  // only remove the files nothing else still references.
  await deleteUnreferencedByPublicUrl({ urls: [item.image_url, item.mundane_image_url] });
}

/**
 * Reshapes a raw `library_items` row into the `Item` shape every consumer
 * (Vault, stores, crafting, factions, NPC inventory, …) already expects.
 * `library_items` carries no `user_id`/`campaign_id`/`dm_notes`/`spell_ids`/
 * document-item columns — leaving those `undefined` reads as "has content" to
 * a `content !== null` check (feather badge on every SRD item), so every
 * reader of a library row must go through this rather than casting the raw
 * row directly. Exported for the other tables that now embed `library_items`
 * (#819) — `useStoreItems.ts` in particular.
 */
export function normalizeLibraryItem(row: Record<string, unknown>): Item {
  return {
    ...row,
    user_id: "",
    campaign_id: null,
    dm_notes: null,
    spell_ids: [],
    content: null,
    content_player_writable: false,
    content_updated_at: null,
  } as unknown as Item;
}

/** The player-visible custom items (their vault + shared store items) via the
 *  get_player_visible_items SECURITY DEFINER projection (migration
 *  20260711000014), with `dm_notes` nulled. Players have no direct base-table
 *  read path (RLS is owner-only). A small list: it holds no library rows. */
async function fetchPlayerVisibleItems(): Promise<Item[]> {
  const { data, error } = await supabase.rpc("get_player_visible_items");
  if (error) throw error;
  return (data ?? []) as Item[];
}

export function usePlayerItemProjection(getOptions?: () => { enabled?: boolean }) {
  const ui = useUiStore();
  const isEnabled = () => getOptions?.().enabled !== false;

  // Real player → gated projection. DM preview → the DM's own rows (the DM
  // isn't a campaign_member, so the projection returns nothing; the DM owns the
  // rows and needs them to resolve inventory item details). Never the library: a held library id is
  // read by id through `useStoredItemRefs`, and a picker reads `useItemIndex` (#972).
  const projectionQuery = useQuery({
    queryKey: [QUERY_KEY, "player-visible"],
    queryFn: fetchPlayerVisibleItems,
    enabled: () => isEnabled() && !ui.dmPreviewMode,
    staleTime: Infinity,
  });
  const baseQuery = useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchItems,
    enabled: () => isEnabled() && ui.dmPreviewMode,
    staleTime: Infinity,
  });
  /** The player's custom items; the source to resolve held ids in. */
  const data = computed(() => (ui.dmPreviewMode ? baseQuery.data.value : projectionQuery.data.value));
  const isLoading = computed(() =>
    ui.dmPreviewMode ? baseQuery.isLoading.value : projectionQuery.isLoading.value,
  );

  /**
   * Re-run the projection now, ignoring `staleTime: Infinity`.
   *
   * That staleTime makes the projection a snapshot taken when the page loaded.
   * The doorbell ends it for every member: the `items`, `store_items` and
   * `party_inventory` rings all refresh the `items` root, and a ring reaches a
   * player even for a table they may not read, since it carries no row. Two
   * rings can still be read out of step (the store's rows refresh before the
   * projection does), so a caller that can tell the snapshot is behind says so
   * here. See `useSharedStoreItems`.
   */
  async function refetch(): Promise<void> {
    await (ui.dmPreviewMode ? baseQuery.refetch() : projectionQuery.refetch());
  }

  return { data, isLoading, refetch };
}

export function useItem(id: Ref<string> | ComputedRef<string> | string) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, isRef(id) ? id.value : id] as const),
    queryFn: ({ queryKey: [, itemId] }) => fetchItem(itemId),
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
 * sweep collects it.
 *
 * That last sentence is only true of a row that never had a vector (#846). A
 * row that already had one keeps the **old** one when this fails: it is not
 * unembedded, it is wrong, and retrieval goes on matching it against text the
 * DM has since rewritten. It is also invisible to the "index unembedded
 * content" offer, which lists rows with no vector at all — a stale row has
 * one. Only the admin batch backfill compares hashes and repairs it.
 *
 * The failure is now reported to Sentry rather than swallowed, so we can find
 * out how often this actually happens before choosing between #846's three
 * candidate fixes. Still silent to the DM, which is the part that was right. The edge function short-circuits when the embed text's
 * hash is unchanged, so a save that only touched art or dm_notes costs no API
 * call at all.
 *
 * Custom items only. `library_items` is embedded by the admin batch
 * (embed-content, entity "library_item"), which is why there is no
 * queueLibraryItemEmbedding — shared content has no per-user write path.
 */
export function queueItemEmbedding(id: string): Promise<void> {
  // Resolves once the invocation has settled, errors already reported — so a
  // bulk caller can bound how many are in flight (useCopyToCampaign's
  // queueEmbeddingsInGroups) while single-row callers keep ignoring it.
  return supabase.functions
    .invoke("embed-content", { body: { mode: "single", entity: "item", id } })
    .then(() => undefined, (error: unknown) => { reportHandledError(error, "queueItemEmbedding", { id }); });
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

export interface ResolvedItem {
  item: Item;
  isShared: boolean;
}

export function resolvedItemKey(id: string) {
  return ["resolved-item", id] as const;
}

/** The lookup behind {@link useResolvedItem}; exported so a list card can warm
 *  the detail page's cache on hover (#972) with the exact same fetcher. */
export async function fetchResolvedItem(itemId: string): Promise<ResolvedItem> {
  // library_items ids are text slugs, custom items are uuids — the two id
  // spaces are disjoint, so branch on the id shape and do a single lookup
  // rather than always probing library_items first (the common owned-item
  // detail page is a uuid and would otherwise pay a guaranteed-miss query).
  if (isUuid(itemId)) {
    const item = await fetchItem(itemId);
    if (!item) throw new Error("Item not found");
    return { item, isShared: false };
  }
  const { data: shared, error: sharedError } = await supabase
    .from("library_items").select("*").eq("id", itemId).maybeSingle();
  if (sharedError) throw sharedError;
  if (!shared) throw new Error("Item not found");
  return { item: normalizeLibraryItem(shared), isShared: true };
}

/** Resolve an opaque item ID against explicit shared/custom stores — mirrors
 *  {@link useResolvedMonster}/`useResolvedSpell`. */
export function useResolvedItem(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => resolvedItemKey(id.value)),
    queryFn: ({ queryKey: [, itemId] }) => fetchResolvedItem(itemId),
    enabled: () => !!id.value,
  });
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e
    && (e as { code?: unknown }).code === UNIQUE_VIOLATION;
}

/**
 * The explicit "Customize" action, and nothing else: copies a shared library
 * item into the DM's own `items` table so it can be edited. A uuid `Item`
 * (already owned) passes through unchanged; a library row is cloned once, and
 * the vault's unique index on (user_id, source_document_key, source_record_key)
 * means a second Customize opens the existing copy instead of making another.
 *
 * Every picker (inventory, chat, stores, loot tables, encounters) stores a
 * reference to the library row instead (`itemRefColumns`); do not call this to
 * make a pick "ownable".
 */
export function useCustomizeLibraryItem() {
  const queryClient = useQueryClient();

  async function customizeLibraryItem(item: Item): Promise<Item> {
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

  return { customizeLibraryItem };
}
