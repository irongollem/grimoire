import { reportHandledError } from "@/lib/observability/sentry";
import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import { useToast } from "@/composables/useToast";
import { getSetting } from "@/settings/index";
import { NPC_LIST_COLUMNS } from "@/types/npc.types";
import type { Npc, NpcInsert, NpcListRow, NpcUpdate, PlayerNpc } from "@/types/npc.types";
import { deleteUnreferencedByPublicUrl } from "@/lib/storage";
import { queueEmbeddingsInBackground } from "@/lib/queueEmbeddings";
import { PLAYER_NPCS_KEY } from "@/lib/campaignLiveSync/registry";

const QUERY_KEY = "npcs";

/**
 * The players' NPC projection (`get_player_visible_npcs`) lives under its own
 * root, not under `npcs`. Players cannot read the `npcs` table at all
 * (20260928233302), so their client learns of a change only from the
 * `npcs_player` doorbell signal, and that signal must refresh this projection
 * without touching the DM's row caches under `npcs`.
 */

async function fetchNpcs(campaignId: string): Promise<NpcListRow[]> {
  const { data, error } = await supabase
    .from("npcs")
    .select(NPC_LIST_COLUMNS.join(", "))
    .eq("campaign_id", campaignId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data as unknown as NpcListRow[];
}

async function fetchNpc(id: string): Promise<Npc> {
  const { data, error } = await supabase.from("npcs").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Npc;
}

/** The columns a list row carries, from a full record (a save returns the whole row). */
function toNpcListRow(npc: Npc): NpcListRow {
  return Object.fromEntries(NPC_LIST_COLUMNS.map((column) => [column, npc[column]])) as NpcListRow;
}

/** Exported so a resolved downtime outcome can clone a seed contact into the campaign. */
export async function createNpc(npc: NpcInsert): Promise<Npc> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("npcs")
    .insert({ ...npc, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as Npc;
}

async function updateNpc(id: string, update: NpcUpdate): Promise<Npc> {
  const { data, error } = await supabase.from("npcs").update(update).eq("id", id).select().single();
  if (error) throw error;
  return data as Npc;
}

async function deleteNpc(npc: Npc): Promise<void> {
  const { error } = await supabase.from("npcs").delete().eq("id", npc.id);
  if (error) throw error;
  // NPC portraits live in the `npc-portraits` bucket, not `asset-images` —
  // `removeStorageImages("asset-images", ...)` used to run here, which never
  // matched anything and so never deleted a single file (#917 story 4). This
  // also checks whether another row (e.g. a monster promoted from this NPC)
  // still points at the same file before removing it.
  await deleteUnreferencedByPublicUrl({
    urls: [npc.portrait_url, npc.cutout_url, npc.disguise_portrait_url],
  });
}

/** Every NPC in the active campaign.
 *
 *  `enabled` lets permanently-mounted callers (the chat widget, the closed
 *  generator panels) hold the fetch back until their panel is actually open —
 *  NPC rows carry appearance/personality/backstory/stat_block, so pulling the
 *  whole campaign's set on every page load is a lot of egress for a UI nobody
 *  opened. Query keys are shared, so a page that genuinely needs NPCs still
 *  fetches them once. */
export function useNpcs(enabled?: () => boolean) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, campaignId.value] as const),
    queryFn: ({ queryKey: [, cid] }) => {
      if (!cid) throw new Error("useNpcs fetched without a campaign");
      return fetchNpcs(cid);
    },
    enabled: () => !!campaignId.value && (enabled?.() ?? true),
  });
}

export interface NpcSpellCaster {
  npc_id: string;
  name: string;
}

/**
 * NPCs in the active campaign whose stat-block spellcasting includes the given
 * spell. Spell IDs live inside the `stat_block` JSONB
 * (`spellcasting.entries[].spell_ids`), so this uses a JSONB containment
 * filter rather than a join table.
 */
export function useNpcSpellCasters(spellId: string | Ref<string>) {
  const idRef = isRef(spellId) ? spellId : ref(spellId);
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "spell-casters", campaignId.value, idRef.value] as const),
    queryFn: async ({ queryKey: [, , cid, spellIdKey] }): Promise<NpcSpellCaster[]> => {
      if (!cid) throw new Error("useNpcSpellCasters fetched without a campaign");
      const { data, error } = await supabase
        .from("npcs")
        .select("id, name")
        .eq("campaign_id", cid)
        .contains("stat_block", { spellcasting: { entries: [{ spell_ids: [spellIdKey] }] } })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => ({ npc_id: r.id, name: r.name }));
    },
    enabled: () => !!campaignId.value && !!idRef.value,
  });
}

/** All the "People in the Area" panels render, and all they need. Matches the
 *  narrow shape useEncountersByLocation already uses for the sibling panel. */
export type NpcLocationSummary = Pick<Npc, "id" | "name" | "occupation" | "race" | "location_id">;
const LOCATION_SUMMARY_COLUMNS = "id, name, occupation, race, location_id";

/** Fetch NPCs across multiple location IDs (for "who's here" with descendants).
 *  Ids are sorted into the key so two panels asking for the same set share one
 *  request however they ordered it (#972). */
export function useNpcsByLocations(locationIds: Ref<string[]>) {
  const sortedIds = computed(() => [...locationIds.value].sort());
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "by-locations", sortedIds.value] as const),
    queryFn: async ({ queryKey: [, , ids] }) => {
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("npcs")
        .select(LOCATION_SUMMARY_COLUMNS)
        .in("location_id", ids)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as NpcLocationSummary[];
    },
    enabled: () => locationIds.value.length > 0,
  });
}

export function useNpc(id: string | Ref<string>) {
  const idRef = isRef(id) ? id : ref(id);

  return useQuery({
    queryKey: computed(() => [QUERY_KEY, idRef.value] as const),
    queryFn: ({ queryKey: [, npcId] }) => fetchNpc(npcId),
    enabled: () => !!idRef.value,
    // Deliberately not seeded from the campaign list any more (#999). The list
    // leaves the prose columns out, so a seed would hand the sheet and the editor
    // a record with no appearance, personality, backstory or notes, which reads
    // as an NPC with nothing written and, in an editor, could be saved back that
    // way. The detail views already show their loading state while this reads
    // the one row (a single-row read by id), and a row an earlier visit or a
    // save already put under this key is used as is.
  });
}

/**
 * Reads one NPC in full on demand, through the `useNpc` cache entry, for an
 * action that needs the row once (a click handler) rather than a screen that
 * shows it.
 */
export function useFetchNpc() {
  const queryClient = useQueryClient();
  return (id: string): Promise<Npc> =>
    queryClient.fetchQuery({ queryKey: [QUERY_KEY, id] as const, queryFn: () => fetchNpc(id) });
}

/**
 * Queue this NPC for semantic-search embedding (#600) so retrieval can find it
 * without waiting for the next admin backfill.
 *
 * Fire-and-forget for a single-row caller: the NPC is already saved, so a
 * failed embed is not worth a toast, a spinner or a delayed mutation — the
 * row simply stays unembedded and the next backfill sweep collects it. The
 * edge function short-circuits when the embed text's hash is unchanged, so a
 * save that touched an unrelated field costs no API call at all.
 *
 * Returns `Promise<void>`, resolving once the invocation has settled and any
 * error already reported — mirrors `queueItemEmbedding`/
 * `queueMonsterEmbedding` (useItems.ts, useMonsters.ts) for the same
 * reason theirs does. Bulk callers use `queueEmbeddings`
 * (lib/queueEmbeddings.ts) instead; single-row callers below ignore the
 * return value.
 */
export function queueNpcEmbedding(id: string): Promise<void> {
  return supabase.functions
    .invoke("embed-content", { body: { mode: "single", entity: "npc", id } })
    .then(
      () => undefined,
      (error: unknown) => { reportHandledError(error, "queueNpcEmbedding", { id }); },
    );
}

export function useCreateNpc() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (npc: Omit<NpcInsert, "campaign_id">) =>
      createNpc({ ...npc, campaign_id: campaign.activeCampaignId! }),
    onSuccess: (npc) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      queueNpcEmbedding(npc.id);
    },
  });
}

export function useUpdateNpc() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: NpcUpdate }) => updateNpc(id, update),
    onSuccess: (updatedNpc, { id }) => {
      // Update the list cache in-place to avoid a full list rerender
      queryClient.setQueryData(
        [QUERY_KEY, campaign.activeCampaignId],
        (old: NpcListRow[] | undefined) => old?.map((n) => (n.id === id ? toNpcListRow(updatedNpc) : n)),
      );
      queryClient.setQueryData([QUERY_KEY, id], updatedNpc);
      queueNpcEmbedding(id);
    },
  });
}

export function useDeleteNpc() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: deleteNpc,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

// ── Player portal: shared NPCs ────────────────────────────────────────────────

export function useSharedNpcs() {
  const campaign = useCampaignStore();
  const ui = useUiStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  // In DM preview the caller is the DM (party_member_id null), so the projection
  // needs the previewed member id to know whose view to render.
  const previewMemberId = computed(() => (ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : null));
  return useQuery({
    queryKey: computed(() => [PLAYER_NPCS_KEY, campaignId.value, previewMemberId.value] as const),
    queryFn: async ({ queryKey: [, cid, previewId] }) => {
      if (!cid) throw new Error("useSharedNpcs fetched without a campaign");
      // Server-side projection: strips DM-only columns and swaps disguised NPCs
      // to their cover identity so the real one never reaches the client. See
      // migration 20260613000001 (get_player_visible_npcs).
      const { data, error } = await supabase.rpc("get_player_visible_npcs", {
        p_campaign_id: cid,
        p_preview_member_id: previewId,
      });
      if (error) throw error;
      return ((data ?? []) as PlayerNpc[]).sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? ""),
      );
    },
    enabled: () => !!campaignId.value,
  });
}

/** Fetch player-visible NPCs at specific location IDs (for player atlas). */
export function useSharedNpcsByLocations(locationIds: Ref<string[]>) {
  const ui = useUiStore();
  const previewMemberId = computed(() => (ui.dmPreviewMode ? ui.dmPreviewPartyMemberId : null));
  return useQuery({
    queryKey: computed(() => [PLAYER_NPCS_KEY, "by-locations", locationIds.value, previewMemberId.value] as const),
    queryFn: async ({ queryKey: [, , ids, previewId] }) => {
      if (!ids.length) return [];
      // Same projection RPC as useSharedNpcs, filtered by location.
      const { data, error } = await supabase.rpc("get_player_visible_npcs", {
        p_location_ids: ids,
        p_preview_member_id: previewId,
      });
      if (error) throw error;
      return ((data ?? []) as PlayerNpc[]).sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? ""),
      );
    },
    enabled: () => locationIds.value.length > 0,
  });
}

// ── Populate from setting ──────────────────────────────────────────────────────

/** Normalise a name for fuzzy dedup: lowercase + strip punctuation/symbols. */
function normaliseName(name: string): string {
  return name.toLowerCase().replace(/['\u2018\u2019`\-_.,"!?]/g, "").replace(/\s+/g, " ").trim();
}

function plainTextToTiptap(text: string): string {
  return JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
}

/** Bulk-insert seed NPCs (Hall of Heroes) for the active campaign's setting.
 *  Returns inserted count. Deduplicates by name (case-insensitive). */
export function usePopulateSettingNpcs() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async (): Promise<number> => {
      const campaignId = campaign.activeCampaignId;
      if (!campaignId) throw new Error("No active campaign");

      const { data: campaignRow, error: campaignError } = await supabase
        .from("campaigns")
        .select("calendar_id")
        .eq("id", campaignId)
        .single();
      if (campaignError) throw campaignError;

      const calendarId: string = campaignRow?.calendar_id ?? "faerun";
      const setting = getSetting(calendarId);
      if (!setting?.heroes.length) return 0;

      const user = getCurrentUser();

      const { data: existing, error: fetchError } = await supabase
        .from("npcs")
        .select("id, name, portrait_url")
        .eq("campaign_id", campaignId);
      if (fetchError) throw fetchError;

      const existingMap = new Map(
        (existing ?? []).map((n: { id: string; name: string; portrait_url: string | null }) => [
          normaliseName(n.name),
          n,
        ]),
      );

      // Update portrait_url for existing NPCs that still have none but the setting now has one
      const portraitUpdates = setting.heroes.filter((h) => {
        if (!h.portrait_url) return false;
        const match = existingMap.get(normaliseName(h.name));
        return match && !match.portrait_url;
      });

      if (portraitUpdates.length) {
        await Promise.all(
          portraitUpdates.map((h) =>
            supabase
              .from("npcs")
              .update({ portrait_url: h.portrait_url })
              .eq("id", existingMap.get(normaliseName(h.name))!.id),
          ),
        );
      }

      const toInsert: NpcInsert[] = setting.heroes
        .filter((h) => !existingMap.has(normaliseName(h.name)))
        .map((h) => ({
          campaign_id: campaignId,
          name: h.name,
          race: h.race,
          alignment: h.alignment,
          age: null,
          occupation: h.occupation,
          appearance: null,
          personality: h.personality ? plainTextToTiptap(h.personality) : null,
          backstory: h.backstory ? plainTextToTiptap(h.backstory) : null,
          notes: null,
          status: h.status,
          relationship: h.relationship,
          portrait_url: h.portrait_url,
          cutout_url: null,
          portrait_focal_point: null,
          disguise_name: null,
          disguise_portrait_url: null,
          disguise_portrait_focal_point: null,
          is_revealed: true,
          tags: h.tags,
          stat_block: null,
          scriptorium_doc_id: null,
          player_visible_to: [],
          player_visible_fields: [],
        }));

      if (!toInsert.length) return portraitUpdates.length > 0 ? 0 : 0;

      const { data: inserted, error: insertError } = await supabase
        .from("npcs")
        .insert(toInsert.map((n) => ({ ...n, user_id: user!.id })))
        .select("id");
      if (insertError) throw insertError;

      // Bulk insert bypasses useCreateNpc()'s mutation hook, so the new rows
      // need an embed call here (one batched request, #972) -- otherwise these NPCs stay
      // unretrievable until the next admin backfill (mirrors
      // useCloneLibraryMonster's comment in useMonsters.ts).
      queueEmbeddingsInBackground("npc", (inserted ?? []).map((row) => row.id));

      return (inserted ?? []).length;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, campaign.activeCampaignId] }),
  });
}

