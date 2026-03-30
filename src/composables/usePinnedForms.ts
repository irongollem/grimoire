import { computed, toValue, type MaybeRef } from "vue";
import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import type { Monster } from "@/types/monster.types";

export interface PinnedForm {
  id: string;
  campaign_id: string;
  party_member_id: string;
  monster_id: string | null;
  srd_slug: string | null;
  monster_name: string;
  image_url: string | null;
}

const QUERY_KEY = "pinned-forms";

/** Player: fetch forms pinned to the current player's character. */
export function usePinnedForms() {
  return useQuery({
    queryKey: [QUERY_KEY, "player"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pinned_forms").select("*");
      if (error) throw error;
      return data as PinnedForm[];
    },
  });
}

/** DM: fetch all pinned forms for a specific party member. Accepts a reactive ref. */
export function useDmPinnedForms(partyMemberId: MaybeRef<string | null>) {
  const campaign = useCampaignStore();
  return useQuery({
    queryKey: computed(() => [QUERY_KEY, "dm", toValue(partyMemberId)]),
    queryFn: async () => {
      const id = toValue(partyMemberId);
      if (!id) return [];
      const { data, error } = await supabase
        .from("pinned_forms")
        .select("*")
        .eq("party_member_id", id);
      if (error) throw error;
      return data as PinnedForm[];
    },
    enabled: computed(() => !!campaign.activeCampaignId && !!toValue(partyMemberId)),
  });
}

/** DM: toggle a pinned form for a party member on/off. */
export function useTogglePinnedForm() {
  const queryClient = useQueryClient();
  const campaign = useCampaignStore();

  return useMutation({
    mutationFn: async ({
      monster,
      partyMemberId,
      existing,
    }: {
      monster: Pick<Monster, "id" | "name" | "is_srd" | "image_url">;
      partyMemberId: string;
      existing: PinnedForm | undefined;
    }) => {
      if (existing) {
        const { error } = await supabase.from("pinned_forms").delete().eq("id", existing.id);
        if (error) throw error;
        return null;
      } else {
        const { data, error } = await supabase
          .from("pinned_forms")
          .insert({
            campaign_id: campaign.activeCampaignId!,
            party_member_id: partyMemberId,
            monster_id: monster.is_srd ? null : monster.id,
            srd_slug: monster.is_srd ? monster.id : null,
            monster_name: monster.name,
            image_url: monster.image_url ?? null,
          })
          .select()
          .single();
        if (error) throw error;
        return data as PinnedForm;
      }
    },
    onSettled: (_data, _err, vars) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, "dm", vars.partyMemberId] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, "player"] });
    },
  });
}
