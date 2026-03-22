import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { computed } from "vue";
import type { NpcRelation, NpcRelationInsert, NpcRelationUpdate } from "@/types/npc.types";

const KEY = "npc_relationships";

async function fetchRelations(npcId: string): Promise<NpcRelation[]> {
  const { data, error } = await supabase
    .from("npc_relationships")
    .select("*")
    .or(`npc_id.eq.${npcId},related_npc_id.eq.${npcId}`)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as NpcRelation[];
}

async function createRelation(relation: NpcRelationInsert): Promise<NpcRelation> {
  const user = getCurrentUser();
  const { data, error } = await supabase
    .from("npc_relationships")
    .insert({ ...relation, user_id: user!.id })
    .select()
    .single();
  if (error) throw error;
  return data as NpcRelation;
}

async function updateRelation(id: string, update: NpcRelationUpdate): Promise<NpcRelation> {
  const { data, error } = await supabase
    .from("npc_relationships")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as NpcRelation;
}

async function deleteRelation(id: string): Promise<void> {
  const { error } = await supabase.from("npc_relationships").delete().eq("id", id);
  if (error) throw error;
}

export function useNpcRelations(npcId: string) {
  return useQuery({
    queryKey: computed(() => [KEY, npcId]),
    queryFn: () => fetchRelations(npcId),
    enabled: !!npcId,
  });
}

export function useCreateNpcRelation() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: (relation: Omit<NpcRelationInsert, "campaign_id">) =>
      createRelation({ ...relation, campaign_id: campaign.activeCampaignId ?? null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateNpcRelation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, update }: { id: string; update: NpcRelationUpdate }) =>
      updateRelation(id, update),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteNpcRelation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteRelation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [KEY] }),
  });
}
