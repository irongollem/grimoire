import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, toValue, type Ref, type MaybeRefOrGetter } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { reportHandledError } from "@/lib/observability/sentry";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";
import { PLAYER_FACTIONS_KEY } from "@/lib/campaignLiveSync/registry";
import { loadSettingContent } from "@/settings/content";
import { matchSettingRowIds, stampSettingSource } from "@/lib/populateSetting/settingContent";
import { useToast } from "@/composables/useToast";
import type {
  Faction,
  FactionInsert,
  FactionNpc,
  FactionPartyMember,
} from "@/types/faction.types";
import type { Npc } from "@/types/npc.types";
import type { PartyMember } from "@/types/party.types";
import { queueEmbeddingsInBackground } from "@/lib/queueEmbeddings";
import { HEAD_ROLES } from "@/types/faction.types";

// ── Factions CRUD ──────────────────────────────────────────────────────────────

/** The faction list read; shared by `useAllFactions` and the navigation prefetch. */
export function factionListQuery(campaignId: string | null) {
  return {
    queryKey: ["factions", campaignId] as const,
    queryFn: async () => {
      if (campaignId === null) throw new Error("useAllFactions fetched without a campaign");
      const { data, error } = await supabase
        .from("factions")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Faction[];
    },
  };
}

/** `enabled` lets permanently-mounted callers defer the fetch until their panel
 *  is open — see {@link useNpcs} for the rationale. */
export function useAllFactions(enabled?: () => boolean) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const options = computed(() => factionListQuery(campaignId.value));
  return useQuery({
    queryKey: computed(() => options.value.queryKey),
    queryFn: () => options.value.queryFn(),
    enabled: () => !!campaignId.value && (enabled?.() ?? true),
  });
}

export function useFaction(id: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => ["factions", toValue(id)] as const),
    queryFn: async ({ queryKey: [, fid] }) => {
      const { data, error } = await supabase
        .from("factions")
        .select("*")
        .eq("id", fid)
        .single();
      if (error) throw error;
      return data as Faction;
    },
    enabled: () => !!toValue(id),
  });
}

/**
 * The factions a player may read, as the server projects them (a faction shared
 * with their character, or one their character belongs to) with DM-only secret
 * blocks stripped from the description (`get_player_visible_factions`, #932).
 * Players cannot select `factions` any more. With a DM previewing as a party
 * member the RPC returns exactly that member's view, so callers do not filter.
 * Refreshed by the `factions_player` doorbell.
 */
export function usePlayerVisibleFactions() {
  const campaign = useCampaignStore();
  const appUi = useAppUiStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const previewMemberId = computed(() => (appUi.dmPreviewMode ? appUi.dmPreviewPartyMemberId : null));
  return useQuery({
    queryKey: computed(() => [PLAYER_FACTIONS_KEY, campaignId.value, previewMemberId.value] as const),
    queryFn: async ({ queryKey: [, cid, previewId] }) => {
      if (cid === null) throw new Error("usePlayerVisibleFactions fetched without a campaign");
      const { data, error } = await supabase.rpc("get_player_visible_factions", {
        p_campaign_id: cid,
        p_preview_member_id: previewId,
      });
      if (error) throw error;
      return (data as Faction[]).sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: computed(() => !!campaignId.value),
  });
}

/**
 * Queue this faction for semantic-search embedding (#600) so retrieval can
 * find it without waiting for the next admin backfill.
 *
 * Fire-and-forget on purpose: the faction is already saved, so a failed embed
 * is not worth a toast, a spinner or a delayed mutation — the row simply stays
 * unembedded and the next backfill sweep collects it. The edge function
 * short-circuits when the embed text's hash is unchanged, so a save that
 * touched an unrelated field costs no API call at all.
 *
 * Exported and `Promise<void>`-returning, like its siblings. Bulk inserts
 * (bulk create, copy-to-campaign) go through `queueEmbeddings`
 * (lib/queueEmbeddings.ts) instead, one batched request per 100 rows (#972).
 */
export function queueFactionEmbedding(id: string): Promise<void> {
  return supabase.functions
    .invoke("embed-content", { body: { mode: "single", entity: "faction", id } })
    .then(
      () => undefined,
      (error: unknown) => { reportHandledError(error, "queueFactionEmbedding", { id }); },
    );
}

export function useCreateFaction() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async (
      payload: Omit<FactionInsert, "user_id" | "campaign_id">,
    ) => {
      const user = getCurrentUser();
      const { data, error } = await supabase
        .from("factions")
        .insert({ ...payload, user_id: user!.id, campaign_id: campaign.activeCampaignId! })
        .select()
        .single();
      if (error) throw error;
      return data as Faction;
    },
    onSuccess: (faction) => {
      qc.invalidateQueries({ queryKey: ["factions", campaign.activeCampaignId] });
      queueFactionEmbedding(faction.id);
    },
  });
}

export function useUpdateFaction() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async ({
      id,
      update,
    }: {
      id: string;
      update: Partial<Faction>;
    }) => {
      const { error } = await supabase
        .from("factions")
        .update(update)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ["factions", campaign.activeCampaignId] });
      queueFactionEmbedding(id);
    },
  });
}

export function useDeleteFaction() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  const toast = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("factions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["factions", campaign.activeCampaignId] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

// ── Faction Members (NPCs) ─────────────────────────────────────────────────────

export interface FactionNpcWithNpc extends FactionNpc {
  npc: Pick<
    Npc,
    "id" | "name" | "occupation" | "race" | "status" | "portrait_url" | "portrait_focal_point"
  >;
}

export function useFactionNpcs(factionId: MaybeRefOrGetter<string | null>) {
  return useQuery({
    queryKey: computed(() => ["faction-npcs", toValue(factionId)] as const),
    queryFn: async ({ queryKey: [, id] }) => {
      if (id === null) throw new Error("No faction to read the roster of");
      const { data, error } = await supabase
        .from("faction_npcs")
        .select("*, npc:npcs(id, name, occupation, race, status, portrait_url, portrait_focal_point)")
        .eq("faction_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as FactionNpcWithNpc[];
    },
    enabled: computed(() => !!toValue(factionId)),
  });
}

/** Player-accessible version — returns all PC members of a faction the player belongs to. */
export function usePlayerFactionPartyMembers(factionId: Ref<string>, enabled: Ref<boolean>) {
  return useQuery({
    queryKey: computed(() => ["player-faction-party-members", factionId.value] as const),
    queryFn: async ({ queryKey: [, fid] }) => {
      const { data, error } = await supabase
        .from("faction_party_members")
        .select("*, party_member:party_members(id, name, class, species_id, level, portrait_url, portrait_focal_point, ruleset, campaign_id)")
        .eq("faction_id", fid)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as (FactionPartyMember & {
        party_member: Pick<PartyMember, "id" | "name" | "class" | "species_id" | "level" | "portrait_url" | "portrait_focal_point" | "ruleset" | "campaign_id">;
      })[];
    },
    enabled: computed(() => !!factionId.value && enabled.value),
  });
}

/**
 * Player-accessible version — only works if the player is a member of the faction (via RLS).
 * Returns only the faction_npcs link rows (npc_id/role/status); the caller resolves each
 * NPC's display fields through the player-visible projection (get_player_visible_npcs via
 * useSharedNpcs). Selecting the npcs join directly here would leak a disguised or name-hidden
 * NPC's real name/race/occupation (the base npcs table returns full rows to members).
 */
export function usePlayerFactionNpcs(factionId: Ref<string>, enabled: Ref<boolean>) {
  return useQuery({
    queryKey: computed(() => ["player-faction-npcs", factionId.value] as const),
    queryFn: async ({ queryKey: [, fid] }) => {
      const { data, error } = await supabase
        .from("faction_npcs")
        .select("*")
        .eq("faction_id", fid)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as FactionNpc[];
    },
    enabled: computed(() => !!factionId.value && enabled.value),
  });
}

/**
 * Every faction membership in the campaign, in one query per side.
 *
 * The per-entity `useFactionNpcs` / `useNpcFactions` above answer "who is in
 * this faction" and "what is this NPC in"; the world web needs the whole
 * grid at once to badge every node, and doing that through the per-entity hooks
 * would be one request per NPC.
 *
 * `faction_npcs` carries no `campaign_id` of its own — membership is scoped by
 * the faction it points at — so the campaign filter goes through an `!inner`
 * embed rather than a column on the join table.
 */
export interface FactionMembership {
  faction_id: string;
  role: string | null;
  status: string;
  faction: Pick<Faction, "id" | "name" | "emblem_url">;
}

export interface NpcFactionMembership extends FactionMembership {
  npc_id: string;
}

export interface PartyMemberFactionMembership extends FactionMembership {
  party_member_id: string;
}

export function useAllFactionNpcs() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => ["faction-npcs", "all", campaignId.value] as const),
    queryFn: async ({ queryKey: [, , cid] }) => {
      if (cid === null) throw new Error("useAllFactionNpcs fetched without a campaign");
      const { data, error } = await supabase
        .from("faction_npcs")
        .select("npc_id, faction_id, role, status, faction:factions!inner(id, name, emblem_url, campaign_id)")
        .eq("faction.campaign_id", cid);
      if (error) throw error;
      return data as unknown as NpcFactionMembership[];
    },
    enabled: () => !!campaignId.value,
  });
}

export function useAllFactionPartyMembers() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => ["faction-party-members", "all", campaignId.value] as const),
    queryFn: async ({ queryKey: [, , cid] }) => {
      if (cid === null) throw new Error("useAllFactionPartyMembers fetched without a campaign");
      const { data, error } = await supabase
        .from("faction_party_members")
        .select("party_member_id, faction_id, role, status, faction:factions!inner(id, name, emblem_url, campaign_id)")
        .eq("faction.campaign_id", cid);
      if (error) throw error;
      return data as unknown as PartyMemberFactionMembership[];
    },
    enabled: () => !!campaignId.value,
  });
}

export function useNpcFactions(npcId: string) {
  return useQuery({
    queryKey: ["npc-factions", npcId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faction_npcs")
        .select("*, faction:factions(id, name, faction_type, emblem_url)")
        .eq("npc_id", npcId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as (FactionNpc & {
        faction: Pick<Faction, "id" | "name" | "faction_type" | "emblem_url">;
      })[];
    },
    enabled: !!npcId,
  });
}

export function useAddFactionNpc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      faction_id: string;
      npc_id: string;
      role?: string;
    }) => {
      const user = getCurrentUser();
      const { error } = await supabase
        .from("faction_npcs")
        .insert({ ...payload, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["faction-npcs", vars.faction_id] });
      qc.invalidateQueries({ queryKey: ["npc-factions", vars.npc_id] });
    },
  });
}

export function useUpdateFactionNpcRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      role,
      faction_id: _f,
      npc_id: _n,
    }: {
      id: string;
      role: string;
      faction_id: string;
      npc_id: string;
    }) => {
      const { error } = await supabase
        .from("faction_npcs")
        .update({ role })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["faction-npcs", vars.faction_id] });
      qc.invalidateQueries({ queryKey: ["npc-factions", vars.npc_id] });
    },
  });
}

export function useUpdateFactionNpcStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
      faction_id: _f,
      npc_id: _n,
    }: {
      id: string;
      status: string;
      faction_id: string;
      npc_id: string;
    }) => {
      const { error } = await supabase
        .from("faction_npcs")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["faction-npcs", vars.faction_id] });
      qc.invalidateQueries({ queryKey: ["npc-factions", vars.npc_id] });
    },
  });
}

export function useRemoveFactionNpc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      faction_id: _f,
      npc_id: _n,
    }: {
      id: string;
      faction_id: string;
      npc_id: string;
    }) => {
      const { error } = await supabase
        .from("faction_npcs")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["faction-npcs", vars.faction_id] });
      qc.invalidateQueries({ queryKey: ["npc-factions", vars.npc_id] });
    },
  });
}

// ── Faction Party Members ──────────────────────────────────────────────────────

export interface FactionPartyMemberWithMember extends FactionPartyMember {
  party_member: Pick<PartyMember, "id" | "name" | "class" | "species_id" | "level" | "portrait_url" | "portrait_focal_point" | "ruleset" | "campaign_id">;
}

export function useFactionPartyMembers(factionId: MaybeRefOrGetter<string | null>) {
  return useQuery({
    queryKey: computed(() => ["faction-party-members", toValue(factionId)] as const),
    queryFn: async ({ queryKey: [, id] }) => {
      if (id === null) throw new Error("No faction to read the roster of");
      const { data, error } = await supabase
        .from("faction_party_members")
        .select("*, party_member:party_members(id, name, class, species_id, level, portrait_url, portrait_focal_point, ruleset, campaign_id)")
        .eq("faction_id", id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as FactionPartyMemberWithMember[];
    },
    enabled: computed(() => !!toValue(factionId)),
  });
}

export function usePartyMemberFactions(partyMemberId: string | Ref<string>) {
  const id = typeof partyMemberId === "string" ? partyMemberId : partyMemberId;
  return useQuery({
    queryKey: computed(() => ["party-member-factions", typeof id === "string" ? id : id.value] as const),
    queryFn: async ({ queryKey: [, pid] }) => {
      const { data, error } = await supabase
        .from("faction_party_members")
        .select("*")
        .eq("party_member_id", pid)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as FactionPartyMember[];
    },
    enabled: computed(() => !!(typeof id === "string" ? id : id.value)),
  });
}

export function useAddFactionPartyMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { faction_id: string; party_member_id: string; role?: string }) => {
      const user = getCurrentUser();
      const { error } = await supabase
        .from("faction_party_members")
        .insert({ ...payload, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["faction-party-members", vars.faction_id] });
      qc.invalidateQueries({ queryKey: ["party-member-factions", vars.party_member_id] });
    },
  });
}

/** Who is told that this NPC belongs to the faction (party_members ids). */
export function useUpdateFactionNpcAudience() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, playerVisibleTo }: { id: string; playerVisibleTo: string[]; faction_id: string; npc_id: string }) => {
      const { error } = await supabase.from("faction_npcs").update({ player_visible_to: playerVisibleTo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["faction-npcs", vars.faction_id] });
      qc.invalidateQueries({ queryKey: ["npc-factions", vars.npc_id] });
    },
  });
}

/** Who is told that this character belongs to the faction (party_members ids). */
export function useUpdateFactionPartyMemberAudience() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, playerVisibleTo }: { id: string; playerVisibleTo: string[]; faction_id: string; party_member_id: string }) => {
      const { error } = await supabase.from("faction_party_members").update({ player_visible_to: playerVisibleTo }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["faction-party-members", vars.faction_id] });
      qc.invalidateQueries({ queryKey: ["party-member-factions", vars.party_member_id] });
    },
  });
}

export function useUpdateFactionPartyMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, role, faction_id: _f, party_member_id: _p }: {
      id: string; role: string; faction_id: string; party_member_id: string;
    }) => {
      const { error } = await supabase.from("faction_party_members").update({ role }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["faction-party-members", vars.faction_id] });
      qc.invalidateQueries({ queryKey: ["party-member-factions", vars.party_member_id] });
    },
  });
}

export function useUpdateFactionPartyMemberStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, faction_id: _f, party_member_id: _p }: {
      id: string; status: string; faction_id: string; party_member_id: string;
    }) => {
      const { error } = await supabase.from("faction_party_members").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["faction-party-members", vars.faction_id] });
      qc.invalidateQueries({ queryKey: ["party-member-factions", vars.party_member_id] });
    },
  });
}

export function useRemoveFactionPartyMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, faction_id: _f, party_member_id: _p }: {
      id: string; faction_id: string; party_member_id: string;
    }) => {
      const { error } = await supabase.from("faction_party_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["faction-party-members", vars.faction_id] });
      qc.invalidateQueries({ queryKey: ["party-member-factions", vars.party_member_id] });
    },
  });
}

// ── Populate from setting ──────────────────────────────────────────────────────

/** Bulk-insert seed factions for the active campaign's setting. Returns inserted count.
 *  Deduplicates by name (case-insensitive). */
export function usePopulateFactions() {
  const qc = useQueryClient();
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
      const setting = await loadSettingContent(calendarId);
      if (!setting?.factions.length) return 0;

      const user = getCurrentUser();

      const { data: existing, error: fetchError } = await supabase
        .from("factions")
        .select("id, name")
        .eq("campaign_id", campaignId);
      if (fetchError) throw fetchError;

      const existingNames = new Set(
        (existing ?? []).map((f: { name: string }) => f.name.toLowerCase()),
      );

      // Repair pass for campaigns populated before `setting_source` existed:
      // rows we shipped were counting against the user's own faction cap. See
      // lib/settingContent for why this is not a SQL backfill.
      await stampSettingSource(
        "factions",
        matchSettingRowIds(existing ?? [], setting.factions.map((f) => f.name)),
        calendarId,
      );

      const toInsert = setting.factions
        .filter((f) => !existingNames.has(f.name.toLowerCase()))
        .map((f) => ({
          name: f.name,
          description: f.description
            ? JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: f.description }] }] })
            : null,
          faction_type: f.faction_type,
          alignment: f.alignment,
          tags: f.tags,
          emblem_url: null,
          player_visible_to: [],
          setting_source: calendarId,
          user_id: user!.id,
          campaign_id: campaignId,
        }));

      if (!toInsert.length) return 0;

      const { data: inserted, error: insertError } = await supabase
        .from("factions")
        .insert(toInsert)
        .select("id");
      if (insertError) throw insertError;

      // Bulk insert bypasses useCreateFaction()'s mutation hook, so the new
      // rows need an embed call here (one batched request, #972) -- otherwise these factions stay
      // unretrievable until the next admin backfill (mirrors
      // useCloneLibraryMonster's comment in useMonsters.ts).
      queueEmbeddingsInBackground("faction", (inserted ?? []).map((row) => row.id));

      return (inserted ?? []).length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["factions"] }),
  });
}

/**
 * Whether a faction already has a head, NPC or character: a Leader or a Head of
 * house. The Connections block does not offer those roles to a second member
 * (#1084), so a faction cannot end up with two.
 */
export function useFactionHeaded(factionId: MaybeRefOrGetter<string | null>) {
  const npcs = useFactionNpcs(factionId);
  const pcs = useFactionPartyMembers(factionId);
  return computed(() => {
    const rows = [...(npcs.data.value ?? []), ...(pcs.data.value ?? [])];
    return rows.some((m) => m.role !== null && HEAD_ROLES.includes(m.role));
  });
}
