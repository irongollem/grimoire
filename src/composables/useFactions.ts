import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { getSetting } from "@/settings/index";
import type {
  Faction,
  FactionNpc,
  FactionLocation,
  FactionItem,
  FactionRelation,
  FactionPartyMember,
} from "@/types/faction.types";
import type { Npc } from "@/types/npc.types";
import type { PartyMember } from "@/types/party.types";
import type { Location } from "@/types/location.types";
import type { Item } from "@/types/item.types";

// ── Factions CRUD ──────────────────────────────────────────────────────────────

export function useAllFactions() {
  const campaign = useCampaignStore();
  return useQuery({
    queryKey: ["factions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("factions")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Faction[];
    },
    enabled: !!campaign.activeCampaignId,
  });
}

export function useFaction(id: string) {
  return useQuery({
    queryKey: ["factions", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("factions")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Faction;
    },
    enabled: !!id,
  });
}

export function usePlayerVisibleFactions() {
  return useQuery({
    queryKey: ["factions", "player-visible"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("factions")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Faction[];
    },
  });
}

export function useCreateFaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      payload: Omit<Faction, "id" | "user_id" | "created_at" | "updated_at">,
    ) => {
      const user = getCurrentUser();
      const { data, error } = await supabase
        .from("factions")
        .insert({ ...payload, user_id: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data as Faction;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["factions"] }),
  });
}

export function useUpdateFaction() {
  const qc = useQueryClient();
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["factions"] }),
  });
}

export function useDeleteFaction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("factions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["factions"] }),
  });
}

// ── Faction Members (NPCs) ─────────────────────────────────────────────────────

export interface FactionNpcWithNpc extends FactionNpc {
  npc: Pick<
    Npc,
    "id" | "name" | "occupation" | "race" | "status" | "portrait_url"
  >;
}

export function useFactionNpcs(factionId: string) {
  return useQuery({
    queryKey: ["faction-npcs", factionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faction_npcs")
        .select("*, npc:npcs(id, name, occupation, race, status, portrait_url)")
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
        .select("*, party_member:party_members(id, name, class, race, level, portrait_url)")
        .eq("faction_id", factionId.value)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as (FactionPartyMember & {
        party_member: Pick<PartyMember, "id" | "name" | "class" | "race" | "level" | "portrait_url">;
      })[];
    },
    enabled: computed(() => !!factionId.value && enabled.value),
  });
}

/** Player-accessible version — only works if the player is a member of the faction (via RLS) */
export function usePlayerFactionNpcs(factionId: Ref<string>, enabled: Ref<boolean>) {
  return useQuery({
    queryKey: computed(() => ["player-faction-npcs", factionId.value]),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faction_npcs")
        .select("*, npc:npcs(id, name, occupation, race, disguise_name, disguise_portrait_url, is_revealed)")
        .eq("faction_id", factionId.value)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as (FactionNpc & { npc: Pick<Npc, "id" | "name" | "occupation" | "race" | "disguise_name" | "disguise_portrait_url" | "is_revealed"> })[];
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
  party_member: Pick<PartyMember, "id" | "name" | "class" | "race" | "level" | "portrait_url">;
}

export function useFactionPartyMembers(factionId: string) {
  return useQuery({
    queryKey: ["faction-party-members", factionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("faction_party_members")
        .select("*, party_member:party_members(id, name, class, race, level, portrait_url)")
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
        .select("id, name");
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
        }));

      if (!toInsert.length) return 0;

      const { data: inserted, error: insertError } = await supabase
        .from("factions")
        .insert(toInsert)
        .select("id");
      if (insertError) throw insertError;

      return (inserted ?? []).length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["factions"] }),
  });
}
