import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, toValue, type Ref, type MaybeRefOrGetter } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { getSetting } from "@/settings/index";
import { useToast } from "@/composables/useToast";
import type {
  Faction,
  FactionNpc,
  FactionLocation,
  FactionItem,
  FactionRelation,
  FactionPartyMember,
  FactionDeity,
} from "@/types/faction.types";
import type { Npc } from "@/types/npc.types";
import type { PartyMember } from "@/types/party.types";
import type { Location } from "@/types/location.types";
import type { Item } from "@/types/item.types";
import type { Deity } from "@/types/deity.types";

// ── Factions CRUD ──────────────────────────────────────────────────────────────

/** `enabled` lets permanently-mounted callers defer the fetch until their panel
 *  is open — see {@link useNpcs} for the rationale. */
export function useAllFactions(enabled?: () => boolean) {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => ["factions", campaignId.value]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("factions")
        .select("*")
        .eq("campaign_id", campaignId.value!)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Faction[];
    },
    enabled: () => !!campaignId.value && (enabled?.() ?? true),
  });
}

export function useFaction(id: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => ["factions", toValue(id)]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("factions")
        .select("*")
        .eq("id", toValue(id))
        .single();
      if (error) throw error;
      return data as Faction;
    },
    enabled: () => !!toValue(id),
  });
}

export function usePlayerVisibleFactions() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  return useQuery({
    queryKey: computed(() => ["factions", campaignId.value, "player-visible"]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("factions")
        .select("*")
        .eq("campaign_id", campaignId.value!)
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Faction[];
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
 */
function queueFactionEmbedding(id: string): void {
  void supabase.functions
    .invoke("embed-content", { body: { mode: "single", entity: "faction", id } })
    .catch(() => { /* non-fatal — see above */ });
}

export function useCreateFaction() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async (
      payload: Omit<Faction, "id" | "user_id" | "campaign_id" | "created_at" | "updated_at">,
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

export function useFactionNpcs(factionId: string) {
  return useQuery({
    queryKey: ["faction-npcs", factionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faction_npcs")
        .select("*, npc:npcs(id, name, occupation, race, status, portrait_url, portrait_focal_point)")
        .eq("faction_id", factionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as FactionNpcWithNpc[];
    },
    enabled: !!factionId,
  });
}

/** Player-accessible version — returns all PC members of a faction the player belongs to. */
export function usePlayerFactionPartyMembers(factionId: Ref<string>, enabled: Ref<boolean>) {
  return useQuery({
    queryKey: computed(() => ["player-faction-party-members", factionId.value]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faction_party_members")
        .select("*, party_member:party_members(id, name, class, species_id, level, portrait_url, portrait_focal_point)")
        .eq("faction_id", factionId.value)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as (FactionPartyMember & {
        party_member: Pick<PartyMember, "id" | "name" | "class" | "species_id" | "level" | "portrait_url" | "portrait_focal_point">;
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
    queryKey: computed(() => ["player-faction-npcs", factionId.value]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faction_npcs")
        .select("*")
        .eq("faction_id", factionId.value)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as FactionNpc[];
    },
    enabled: computed(() => !!factionId.value && enabled.value),
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

// ── Faction Deities ────────────────────────────────────────────────────────────

export type FactionDeityWithDeity = FactionDeity & {
  deity: Pick<Deity, "id" | "name" | "titles" | "alignment" | "domains" | "portrait_url">;
};

export function useFactionDeities(factionId: string) {
  return useQuery({
    queryKey: ["faction-deities", factionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faction_deities")
        .select("*, deity:deities(id, name, titles, alignment, domains, portrait_url)")
        .eq("faction_id", factionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as FactionDeityWithDeity[];
    },
    enabled: !!factionId,
  });
}

export function useDeityFactions(deityId: string) {
  return useQuery({
    queryKey: ["deity-factions", deityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faction_deities")
        .select("*, faction:factions(id, name, faction_type, emblem_url)")
        .eq("deity_id", deityId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as (FactionDeity & {
        faction: Pick<Faction, "id" | "name" | "faction_type" | "emblem_url">;
      })[];
    },
    enabled: !!deityId,
  });
}

export function useAddFactionDeity() {
  const qc = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async (payload: { faction_id: string; deity_id: string }) => {
      const user = getCurrentUser();
      const { error } = await supabase.from("faction_deities").insert({
        ...payload,
        user_id: user!.id,
        campaign_id: campaign.activeCampaignId!,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["faction-deities", vars.faction_id] });
      qc.invalidateQueries({ queryKey: ["deity-factions", vars.deity_id] });
    },
  });
}

export function useRemoveFactionDeity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      faction_id: _f,
      deity_id: _d,
    }: {
      id: string;
      faction_id: string;
      deity_id: string;
    }) => {
      const { error } = await supabase.from("faction_deities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["faction-deities", vars.faction_id] });
      qc.invalidateQueries({ queryKey: ["deity-factions", vars.deity_id] });
    },
  });
}

// ── Faction Locations ──────────────────────────────────────────────────────────

export interface FactionLocationWithLocation extends FactionLocation {
  location: Pick<Location, "id" | "name" | "location_type">;
}

export function useFactionLocations(factionId: string) {
  return useQuery({
    queryKey: ["faction-locations", factionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faction_locations")
        .select("*, location:locations(id, name, location_type)")
        .eq("faction_id", factionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as FactionLocationWithLocation[];
    },
    enabled: !!factionId,
  });
}

export function useAddFactionLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      faction_id: string;
      location_id: string;
      notes?: string;
    }) => {
      const user = getCurrentUser();
      const { error } = await supabase
        .from("faction_locations")
        .insert({ ...payload, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({
        queryKey: ["faction-locations", vars.faction_id],
      }),
  });
}

export function useRemoveFactionLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      faction_id: _f,
    }: {
      id: string;
      faction_id: string;
    }) => {
      const { error } = await supabase
        .from("faction_locations")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({
        queryKey: ["faction-locations", vars.faction_id],
      }),
  });
}

// ── Faction Items ──────────────────────────────────────────────────────────────

export interface FactionItemWithItem extends FactionItem {
  item: Pick<Item, "id" | "name" | "item_type" | "rarity">;
}

export function useFactionItems(factionId: string) {
  return useQuery({
    queryKey: ["faction-items", factionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faction_items")
        .select("*, item:items(id, name, item_type, rarity)")
        .eq("faction_id", factionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as FactionItemWithItem[];
    },
    enabled: !!factionId,
  });
}

export function useAddFactionItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      faction_id: string;
      item_id: string;
      notes?: string;
    }) => {
      const user = getCurrentUser();
      const { error } = await supabase
        .from("faction_items")
        .insert({ ...payload, user_id: user!.id });
      if (error) throw error;
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ["faction-items", vars.faction_id] }),
  });
}

export function useRemoveFactionItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      faction_id: _f,
    }: {
      id: string;
      faction_id: string;
    }) => {
      const { error } = await supabase
        .from("faction_items")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ["faction-items", vars.faction_id] }),
  });
}

// ── Faction Relations (directional) ───────────────────────────────────────────

export interface FactionRelationWithFactions extends FactionRelation {
  source_faction: Pick<Faction, "id" | "name">;
  target_faction: Pick<Faction, "id" | "name">;
}

/** All relations where this faction is source OR target */
export function useFactionRelations(factionId: string) {
  return useQuery({
    queryKey: ["faction-relations", factionId],
    queryFn: async () => {
      const [out, inc] = await Promise.all([
        supabase
          .from("faction_relations")
          .select(
            "*, source_faction:factions!faction_id(id, name), target_faction:factions!target_faction_id(id, name)",
          )
          .eq("faction_id", factionId),
        supabase
          .from("faction_relations")
          .select(
            "*, source_faction:factions!faction_id(id, name), target_faction:factions!target_faction_id(id, name)",
          )
          .eq("target_faction_id", factionId),
      ]);
      if (out.error) throw out.error;
      if (inc.error) throw inc.error;
      return {
        outgoing: out.data as FactionRelationWithFactions[],
        incoming: inc.data as FactionRelationWithFactions[],
      };
    },
    enabled: !!factionId,
  });
}

export function useUpsertFactionRelation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      faction_id: string;
      target_faction_id: string;
      relation_type: string;
      notes?: string;
    }) => {
      const user = getCurrentUser();
      const { error } = await supabase
        .from("faction_relations")
        .upsert(
          { ...payload, user_id: user!.id },
          { onConflict: "faction_id,target_faction_id" },
        );
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({
        queryKey: ["faction-relations", vars.faction_id],
      });
      qc.invalidateQueries({
        queryKey: ["faction-relations", vars.target_faction_id],
      });
    },
  });
}

export function useDeleteFactionRelation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      faction_id: _f,
      target_faction_id: _t,
    }: {
      id: string;
      faction_id: string;
      target_faction_id: string;
    }) => {
      const { error } = await supabase
        .from("faction_relations")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({
        queryKey: ["faction-relations", vars.faction_id],
      });
      qc.invalidateQueries({
        queryKey: ["faction-relations", vars.target_faction_id],
      });
    },
  });
}

// ── Faction Party Members ──────────────────────────────────────────────────────

export interface FactionPartyMemberWithMember extends FactionPartyMember {
  party_member: Pick<PartyMember, "id" | "name" | "class" | "species_id" | "level" | "portrait_url" | "portrait_focal_point">;
}

export function useFactionPartyMembers(factionId: string) {
  return useQuery({
    queryKey: ["faction-party-members", factionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faction_party_members")
        .select("*, party_member:party_members(id, name, class, species_id, level, portrait_url, portrait_focal_point)")
        .eq("faction_id", factionId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as FactionPartyMemberWithMember[];
    },
    enabled: !!factionId,
  });
}

export function usePartyMemberFactions(partyMemberId: string | Ref<string>) {
  const id = typeof partyMemberId === "string" ? partyMemberId : partyMemberId;
  return useQuery({
    queryKey: computed(() => ["party-member-factions", typeof id === "string" ? id : id.value]),
    queryFn: async () => {
      const pid = typeof id === "string" ? id : id.value;
      const { data, error } = await supabase
        .from("faction_party_members")
        .select("*, faction:factions(id, name, faction_type, emblem_url, player_visible_to)")
        .eq("party_member_id", pid)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as (FactionPartyMember & {
        faction: Pick<Faction, "id" | "name" | "faction_type" | "emblem_url" | "player_visible_to">;
      })[];
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
      const setting = getSetting(calendarId);
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
          user_id: user!.id,
          campaign_id: campaignId,
        }));

      if (!toInsert.length) return 0;

      const { data: inserted, error: insertError } = await supabase
        .from("factions")
        .insert(toInsert)
        .select("id");
      if (insertError) throw insertError;

      // Bulk insert bypasses useCreateFaction()'s mutation hook, so each new
      // row needs its own embed call here -- otherwise these factions stay
      // unretrievable until the next admin backfill (mirrors
      // useCloneLibraryMonster's comment in useMonsters.ts).
      for (const row of inserted ?? []) queueFactionEmbedding(row.id);

      return (inserted ?? []).length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["factions"] }),
  });
}
