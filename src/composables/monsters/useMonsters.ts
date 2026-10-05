import { reportHandledError } from "@/lib/observability/sentry";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { storeToRefs } from "pinia";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useLibraryMonsterArtEntry, withLibraryArt } from "@/composables/library/useLibraryMonsterArt";
import { useCampaignStore } from "@/stores/campaign";
import type { Monster, MonsterInsert, MonsterUpdate } from "@/types/monster.types";
import { useToast } from "@/composables/useToast";
import { deleteUnreferencedByPublicUrl } from "@/lib/storage";
import { isUuid } from "@/lib/library/contentIdentity";
import { libraryMonsterRow } from "@/lib/library/libraryMonsterRow";


const QUERY_KEY = "monsters";

async function fetchMonster(id: string): Promise<Monster> {
  const { data, error } = await supabase.from("monsters").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Monster;
}

async function createMonster(monster: MonsterInsert): Promise<Monster> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("monsters")
    .insert({ ...monster, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as Monster;
}

async function updateMonster(id: string, update: MonsterUpdate): Promise<Monster> {
  const { data, error } = await supabase
    .from("monsters")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as Monster;
}

async function deleteMonster(monster: Monster): Promise<void> {
  const { error } = await supabase.from("monsters").delete().eq("id", monster.id);
  if (error) throw error;
  // #917: a customized clone (libraryMonsterToInsert) or a same-account
  // campaign copy can point at this same image_url/cutout_url — only remove
  // the files nothing else still references.
  await deleteUnreferencedByPublicUrl({ urls: [monster.image_url, monster.cutout_url] });
}

const LIBRARY_QUERY_KEY = "library-monsters";

/**
 * Every `library_monsters` column a library row is read with, which is every
 * column except `description`. The lore runs to several hundred words a
 * creature, and no list or picker has use for 3,541 of them; it is read one
 * creature at a time by `useLibraryMonsterDescription`. One column list for
 * every library read, so a row fetched by id and a row from a server browse
 * have the same shape.
 * A column added to the table is invisible to the app until it is added here.
 */
export const LIBRARY_MONSTER_COLUMNS = [
  "id", "name", "monster_type", "size", "alignment", "habitat", "source", "source_title", "source_url",
  "is_shared", "open5e_import", "tags", "stat_block", "notes", "image_url", "portrait_focal_point",
  "created_at", "updated_at", "ruleset", "conceptual_key", "source_document_key", "source_record_key",
  "source_revision", "source_license", "provenance",
].join(",");

const LIBRARY_DESCRIPTION_QUERY_KEY = "library-monster-description";

async function fetchLibraryMonsterDescription(id: string): Promise<string | null> {
  const { data, error } = await supabase.from("library_monsters").select("description").eq("id", id).single();
  if (error) throw error;
  return data.description;
}

/** A library monster's lore (Tiptap JSON), or null when it has none. Its own
 *  key prefix on purpose: everything under `library-monsters` is a whole
 *  `Monster` row. */
export function useLibraryMonsterDescription(id: () => string | null) {
  return useQuery({
    queryKey: computed(() => [LIBRARY_DESCRIPTION_QUERY_KEY, id()] as const),
    queryFn: ({ queryKey: [, monsterId] }) => {
      if (monsterId === null) throw new Error("useLibraryMonsterDescription ran without an id");
      return fetchLibraryMonsterDescription(monsterId);
    },
    enabled: () => id() !== null,
    staleTime: Infinity,
  });
}

/** Custom monsters this player may see in a campaign, via the SECURITY DEFINER
 *  `get_player_visible_monsters` projection: rows are gated on the player's
 *  `discovered_monsters.visible_to`, `stat_block` is nulled unless the discovery
 *  revealed stats, and DM `notes`/`description` are stripped. This is the ONLY
 *  player read path for custom monsters — the base table's player SELECT branch
 *  was dropped (20260711000011) so it can't be mined via devtools. */
export async function fetchPlayerVisibleMonsters(campaignId: string): Promise<Monster[]> {
  const { data, error } = await supabase.rpc("get_player_visible_monsters", {
    p_campaign_id: campaignId,
  });
  if (error) throw error;
  return (data ?? []) as Monster[];
}

/** Looks up a single monster from the shared library_monsters table by its slug ID. */
export function useLibraryMonster(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [LIBRARY_QUERY_KEY, id.value] as const),
    queryFn: async ({ queryKey: [, monsterId] }) => {
      const { data, error } = await supabase
        .from("library_monsters")
        .select(LIBRARY_MONSTER_COLUMNS)
        .eq("id", monsterId)
        .single();
      if (error) throw error;
      return libraryMonsterRow(data);
    },
    enabled: () => !!id.value,
    staleTime: Infinity,
  });
}

/** The query key every "resolve this monster id" read shares. */
export const RESOLVED_MONSTER_QUERY_KEY = "resolved-monster";

export interface ResolvedMonster {
  monster: Monster;
  isShared: boolean;
}

/**
 * Resolve an opaque monster id: the shared library row first, then the DM's
 * own. Library ids are non-UUID slugs, so the custom-table query is guarded.
 *
 * The one fetch behind `RESOLVED_MONSTER_QUERY_KEY`. A Scriptorium book's
 * linked stat blocks read the same cache entry (useEntityEmbedData), and each
 * side used to keep its own copy of this fetch returning a different shape:
 * the book cached a bare row, this cached `{ monster, isShared }`. Opening a
 * creature in the Bestiary and then the book crashed the book on
 * `stat_block` (Sentry, 27 Sep 2026), and the reverse order handed the
 * Bestiary a row with no `monster` in it.
 */
export async function fetchResolvedMonster(monsterId: string): Promise<ResolvedMonster> {
  const { data: shared, error: sharedError } = await supabase
    .from("library_monsters").select(LIBRARY_MONSTER_COLUMNS).eq("id", monsterId).maybeSingle();
  if (sharedError) throw sharedError;
  if (shared) return { monster: libraryMonsterRow(shared), isShared: true };
  if (!isUuid(monsterId)) throw new Error("Monster not found");
  return { monster: await fetchMonster(monsterId), isShared: false };
}

/** Resolve an opaque monster ID against explicit shared/custom stores. */
export function useResolvedMonster(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [RESOLVED_MONSTER_QUERY_KEY, id.value] as const),
    queryFn: ({ queryKey: [, monsterId] }) => fetchResolvedMonster(monsterId),
    enabled: () => !!id.value,
  });
}

/**
 * A monster with the DM's own art applied over the canonical library image.
 *
 * The override lives in `library_monster_art`, keyed by the shared row's id, so
 * resolving it needs both queries and a rule about which wins — and `MonsterSheet`
 * takes a finished monster and does not know the art tables exist. Every host of
 * that sheet therefore needs this exact merge, which is why it is here rather
 * than copied into each: the detail modal, the detail page's mobile and edit
 * branches, and whatever adopts the sheet next.
 *
 * Only shared rows can be overridden. A DM's own monster carries its art in its
 * own `image_url`, so there is nothing to look up.
 *
 * A wrapper rather than folding the merge into `useResolvedMonster` itself:
 * that query has a third caller in `QuestRunContainedTool`, which wants the row
 * as stored and would otherwise pay for an art query it never reads — and mocks
 * `useResolvedMonster` directly in its test, so changing that shape breaks it.
 * Art belongs to the surfaces that render a portrait, not to resolution.
 */
export function useMonsterWithArt(id: Ref<string>) {
  // Custom monsters are uuids and carry their art on their own row; only a
  // library id can have art layers, so only it asks. Gated on the id rather
  // than on `isShared` so the art read runs beside the row read, not after it.
  const { data: art } = useLibraryMonsterArtEntry(id, () => !isUuid(id.value));
  const { data, isLoading } = useResolvedMonster(id);

  const isShared = computed(() => data.value?.isShared === true);

  const monster = computed<Monster | null>(() => {
    const row = data.value?.monster;
    if (!row) return null;
    if (!isShared.value) return row;
    return withLibraryArt(row, art.value ?? undefined);
  });

  return { monster, isShared, isLoading };
}

export function useMonster(id: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, id.value] as const),
    queryFn: ({ queryKey: [, monsterId] }) => fetchMonster(monsterId),
    enabled: () => !!id.value,
  });
}

/**
 * Queue this monster for semantic-search embedding (#595) so the encounter
 * suggester can retrieve it without waiting for the next admin backfill.
 *
 * Fire-and-forget on purpose: the monster is already saved, so a failed embed
 * is not worth a toast, a spinner or a delayed mutation — the row simply stays
 * unembedded and the next backfill sweep collects it. The edge function
 * short-circuits when the embed text's hash is unchanged, so a save that
 * touched an unrelated field costs no API call at all.
 */
export function queueMonsterEmbedding(id: string): Promise<void> {
  // Resolves once the invocation has settled, errors already reported — so a
  // bulk caller can bound how many are in flight (useCopyToCampaign's
  // queueEmbeddingsInGroups) while single-row callers keep ignoring it.
  return supabase.functions
    .invoke("embed-monsters", { body: { mode: "single", monster_id: id } })
    .then(() => undefined, (error: unknown) => { reportHandledError(error, "queueMonsterEmbedding", { id }); });
}

export function useCreateMonster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createMonster,
    onSuccess: (monster) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queueMonsterEmbedding(monster.id);
    },
  });
}

export function useUpdateMonster() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: MonsterUpdate }) =>
      updateMonster(id, update),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, id] });
      queueMonsterEmbedding(id);
    },
  });
}

export function useDeleteMonster() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: deleteMonster,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}


/**
 * The library→`MonsterInsert` field mapping shared by every path that copies
 * a `library_monsters` row into the caller's own `monsters` table: the
 * manual "Customize" clone below (`useCloneLibraryMonster`, used by
 * `MonsterDetail.vue`/`MonsterSheetMobile.vue`'s Customize button), the one
 * deliberate way a library monster becomes the DM's own row. Picking a
 * library monster anywhere else stores a reference to it instead.
 */
export function libraryMonsterToInsert(
  libraryMonster: Monster,
  description: string | null,
  campaignId: string | null,
): MonsterInsert {
  const { name, monster_type, size, alignment, habitat, source, tags, stat_block, notes, image_url, cutout_url } =
    libraryMonster;
  return {
    name,
    monster_type,
    size,
    alignment,
    habitat,
    source: `${source ?? "SRD 5.1"} (customized)`,
    tags,
    stat_block,
    description,
    notes,
    image_url,
    cutout_url, // #917 story 1 — a customized clone keeps the library monster's cutout too
    campaign_id: campaignId,
  };
}

/** Clone an SRD monster into the user's own collection. Returns the new Monster. */
export function useCloneLibraryMonster() {
  const queryClient = useQueryClient();
  const { activeCampaignId } = storeToRefs(useCampaignStore());
  return useMutation({
    // Scoped to the campaign the DM cloned it in, like any other new
    // creation — the shared original stays available everywhere regardless.
    mutationFn: async (libraryMonster: Monster): Promise<Monster> => {
      // The lore is not on the row (LIBRARY_MONSTER_COLUMNS); the copy keeps it.
      const description = await queryClient.fetchQuery({
        queryKey: [LIBRARY_DESCRIPTION_QUERY_KEY, libraryMonster.id],
        queryFn: () => fetchLibraryMonsterDescription(libraryMonster.id),
        staleTime: Infinity,
      });
      return createMonster(libraryMonsterToInsert(libraryMonster, description, activeCampaignId.value));
    },
    onSuccess: (monster) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      // This path calls createMonster() directly rather than going through
      // useCreateMonster(), so it does not inherit that mutation's embed hook.
      // Without this line a cloned monster would be the one creation route
      // that stays unretrievable until the next admin backfill.
      queueMonsterEmbedding(monster.id);
    },
  });
}
