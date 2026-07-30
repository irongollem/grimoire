import { computed, isRef, ref } from "vue";
import type { Ref } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { useUiStore } from "@/stores/ui";
import { useToast } from "@/composables/useToast";
import { getSetting } from "@/settings/index";
import type { Npc, NpcInsert, NpcUpdate, PlayerNpc } from "@/types/npc.types";
import { removeStorageImages } from "@/composables/useImageUpload";

const QUERY_KEY = "npcs";

async function fetchNpcs(campaignId: string): Promise<Npc[]> {
  const { data, error } = await supabase
    .from("npcs")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("name", { ascending: true });
  if (error) throw error;
  return data as Npc[];
}

async function fetchNpc(id: string): Promise<Npc> {
  const { data, error } = await supabase.from("npcs").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Npc;
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
  await removeStorageImages("asset-images", npc.portrait_url, npc.disguise_portrait_url);
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
    queryKey: computed(() => [QUERY_KEY, campaignId.value]),
    queryFn: () => fetchNpcs(campaignId.value!),
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
    queryKey: computed(() => [QUERY_KEY, "spell-casters", campaignId.value, idRef.value]),
    queryFn: async (): Promise<NpcSpellCaster[]> => {
      const { data, error } = await supabase
        .from("npcs")
        .select("id, name")
        .eq("campaign_id", campaignId.value!)
        .contains("stat_block", { spellcasting: { entries: [{ spell_ids: [idRef.value] }] } })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r) => ({ npc_id: r.id, name: r.name }));
    },
    enabled: () => !!campaignId.value && !!idRef.value,
  });
}

export function useNpcsByLocation(locationId: string | Ref<string>) {
  const idRef = isRef(locationId) ? locationId : ref(locationId);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "by-location", idRef.value]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("npcs")
        .select("*")
        .eq("location_id", idRef.value)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Npc[];
    },
    enabled: () => !!idRef.value,
  });
}

/** Fetch NPCs across multiple location IDs (for "who's here" with descendants). */
export function useNpcsByLocations(locationIds: Ref<string[]>) {
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "by-locations", locationIds.value]),
    queryFn: async () => {
      if (!locationIds.value.length) return [];
      const { data, error } = await supabase
        .from("npcs")
        .select("*")
        .in("location_id", locationIds.value)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Npc[];
    },
    enabled: () => locationIds.value.length > 0,
  });
}

export function useNpc(id: string | Ref<string>) {
  const idRef = isRef(id) ? id : ref(id);
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, idRef.value]),
    queryFn: () => fetchNpc(idRef.value),
    enabled: () => !!idRef.value,
  });
}

export function useCreateNpc() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (npc: Omit<NpcInsert, "campaign_id">) =>
      createNpc({ ...npc, campaign_id: campaign.activeCampaignId! }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [QUERY_KEY] }),
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
        (old: Npc[] | undefined) => old?.map((n) => (n.id === id ? updatedNpc : n)),
      );
      queryClient.setQueryData([QUERY_KEY, id], updatedNpc);
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
    queryKey: computed(() => [QUERY_KEY, "shared", campaignId.value, previewMemberId.value]),
    queryFn: async () => {
      // Server-side projection: strips DM-only columns and swaps disguised NPCs
      // to their cover identity so the real one never reaches the client. See
      // migration 20260613000001 (get_player_visible_npcs).
      const { data, error } = await supabase.rpc("get_player_visible_npcs", {
        p_campaign_id: campaignId.value!,
        p_preview_member_id: previewMemberId.value,
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
    queryKey: computed(() => [QUERY_KEY, "shared-by-locations", locationIds.value, previewMemberId.value]),
    queryFn: async () => {
      if (!locationIds.value.length) return [];
      // Same projection RPC as useSharedNpcs, filtered by location.
      const { data, error } = await supabase.rpc("get_player_visible_npcs", {
        p_location_ids: locationIds.value,
        p_preview_member_id: previewMemberId.value,
      });
      if (error) throw error;
      return ((data ?? []) as PlayerNpc[]).sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? ""),
      );
    },
    enabled: () => locationIds.value.length > 0,
  });
}

// ── Player personal notes on an NPC ──────────────────────────────────────────

const NOTES_KEY = "npc_player_notes";

export function useNpcPlayerNotes(npcId: string) {
  return useQuery({
    queryKey: [NOTES_KEY, npcId],
    queryFn: async () => {
      const { data } = await supabase
        .from("npc_player_notes")
        .select("notes")
        .eq("npc_id", npcId)
        .maybeSingle();
      return data?.notes ?? "";
    },
    enabled: !!npcId,
  });
}

export function useUpsertNpcPlayerNotes(npcId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (notes: string) => {
      const user = getCurrentUser();
      const { error } = await supabase
        .from("npc_player_notes")
        .upsert({ npc_id: npcId, user_id: user!.id, notes }, { onConflict: "npc_id,user_id" });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [NOTES_KEY, npcId] }),
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

      return (inserted ?? []).length;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, campaign.activeCampaignId] }),
  });
}

