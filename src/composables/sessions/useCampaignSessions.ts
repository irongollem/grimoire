import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { dropLoggedSession } from "@/composables/campaign/useCampaignSession";
import { sortSessionLog } from "@/lib/sessions/sessionPrefill";
import type { CampaignSession } from "@/types/session.types";

export const CAMPAIGN_SESSIONS_KEY = "campaign-sessions";

/**
 * The DM's session log: every row of `campaign_sessions` for the active
 * campaign, newest first by when it was played. Any event on the table invalidates it,
 * through the campaign subscription in `useCampaignLiveSync`.
 */
export function useCampaignSessions() {
  const campaign = useCampaignStore();
  return useQuery({
    queryKey: computed(() => [CAMPAIGN_SESSIONS_KEY, campaign.activeCampaignId] as const),
    queryFn: async ({ queryKey: [, cid] }): Promise<CampaignSession[]> => {
      if (cid === null) throw new Error("useCampaignSessions fetched without a campaign");
      const { data, error } = await supabase
        .from("campaign_sessions")
        .select("*")
        .eq("campaign_id", cid);
      if (error) throw error;
      return sortSessionLog(data as CampaignSession[]);
    },
    enabled: () => !!campaign.activeCampaignId,
  });
}

export interface SessionEdit {
  number?: number | null;
  title?: string | null;
  played_on?: string | null;
}

export function useUpdateCampaignSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, update }: { id: string; update: SessionEdit }): Promise<CampaignSession> => {
      const { data, error } = await supabase
        .from("campaign_sessions")
        .update(update)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data as CampaignSession;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CAMPAIGN_SESSIONS_KEY] });
    },
  });
}

export function useDeleteCampaignSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<string> => {
      const { error } = await supabase.from("campaign_sessions").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      dropLoggedSession(id);
      void queryClient.invalidateQueries({ queryKey: [CAMPAIGN_SESSIONS_KEY] });
    },
  });
}

export interface PastSessionInput {
  number: number | null;
  title: string | null;
  played_on: string;
}

/** A session played before the app, or off it: logged by hand, never started. */
export function useCreatePastSession() {
  const campaign = useCampaignStore();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PastSessionInput): Promise<CampaignSession> => {
      const campaignId = campaign.activeCampaignId;
      if (!campaignId) throw new Error("A past session needs an active campaign");
      const { data, error } = await supabase
        .from("campaign_sessions")
        .insert({ ...input, campaign_id: campaignId, started_at: null })
        .select()
        .single();
      if (error) throw error;
      return data as CampaignSession;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [CAMPAIGN_SESSIONS_KEY] });
    },
  });
}
