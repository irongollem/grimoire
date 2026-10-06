import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { reportHandledError } from "@/lib/observability/sentry";
import { queueNoteEmbedding } from "@/composables/notes/useNotes";
import { useCampaignStore } from "@/stores/campaign";
import { dropLoggedSession } from "@/composables/campaign/useCampaignSession";
import { sortSessionLog } from "@/lib/sessions/sessionPrefill";
import { SESSION_LEARNED_KEY } from "@/lib/sessions/learned";
import type { CampaignSession } from "@/types/session.types";

export const CAMPAIGN_SESSIONS_KEY = "campaign-sessions";

/**
 * The DM's session log: every row of `campaign_sessions` for the active
 * campaign, newest first by when it was played. Any event on the table invalidates it,
 * through the campaign subscription in `useCampaignLiveSync`.
 */
/** `enabled` lets a surface mounted app-wide (a dialog) read the log only while it is open. */
export function useCampaignSessions(options: { enabled?: () => boolean } = {}) {
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
    enabled: () => !!campaign.activeCampaignId && (options.enabled?.() ?? true),
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
    onSuccess: (_row, { id, update }) => {
      void queryClient.invalidateQueries({ queryKey: [CAMPAIGN_SESSIONS_KEY] });
      if (update.number !== undefined || update.title !== undefined) void reembedSessionNotes(id);
    },
  });
}

/**
 * A note's embed text carries its session's number ("Session N"), so renumbering
 * or retitling a session leaves its notes' embeddings stale. Queue each for re-embedding;
 * unchanged hashes cost nothing at the edge function.
 */
async function reembedSessionNotes(sessionId: string): Promise<void> {
  const { data, error } = await supabase.from("notes").select("id").eq("session_id", sessionId);
  if (error) {
    reportHandledError(error, "reembedSessionNotes", { sessionId });
    return;
  }
  for (const note of data) queueNoteEmbedding(note.id);
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

/**
 * Folds `absorbId` into `keepId` (merge_campaign_sessions): its note, encounters,
 * scheduled session and everything learned move across, the kept row takes the
 * number, title, date and run it lacked, and the absorbed row is deleted.
 */
export function useMergeCampaignSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ keepId, absorbId }: { keepId: string; absorbId: string }): Promise<CampaignSession> => {
      const { data, error } = await supabase.rpc("merge_campaign_sessions", { p_keep: keepId, p_absorb: absorbId });
      if (error) throw error;
      return data as CampaignSession;
    },
    onSuccess: (_row, { keepId, absorbId }) => {
      dropLoggedSession(absorbId);
      // Everything that hung off the absorbed row now hangs off the kept one.
      for (const key of [CAMPAIGN_SESSIONS_KEY, "notes", "session-facts", "npc-reveals", SESSION_LEARNED_KEY]) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      void reembedSessionNotes(keepId);
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
