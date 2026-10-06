import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useCampaignSession } from "@/composables/campaign/useCampaignSession";
import type { DmNoteTouch } from "@/types/dmNote.types";

const NONE: readonly DmNoteTouch[] = Object.freeze([]);

/**
 * The entities the DM wrote notes on in the current window: since the running
 * session began, else during the one that last ended. No window, no entries.
 */
export function useDmNoteTouches() {
  const auth = useAuthStore();
  const campaign = useCampaignStore();
  const { session, isRunning } = useCampaignSession();

  const window = computed(() => {
    const row = session.value;
    if (!row || !row.started_at) return { start: null, end: null, label: null };
    if (isRunning.value) return { start: row.started_at, end: null, label: "This session" };
    if (row.ended_at) return { start: row.started_at, end: row.ended_at, label: "Last session" };
    return { start: null, end: null, label: null };
  });

  const query = useQuery({
    queryKey: computed(
      () => ["dm-note-touches", campaign.activeCampaignId, window.value.start, window.value.end] as const,
    ),
    queryFn: async (): Promise<DmNoteTouch[]> => {
      const userId = auth.user?.id;
      const campaignId = campaign.activeCampaignId;
      const { start, end } = window.value;
      if (!userId || !campaignId || !start) return [];
      let q = supabase
        .from("dm_note_touches")
        .select("*")
        .eq("user_id", userId)
        .eq("campaign_id", campaignId)
        .gte("touched_at", start);
      if (end) q = q.lte("touched_at", end);
      const { data, error } = await q.order("touched_at", { ascending: false });
      if (error) throw error;
      return data as DmNoteTouch[];
    },
    enabled: () => !!auth.user?.id && !!campaign.activeCampaignId && window.value.start !== null,
  });

  const touches = computed<readonly DmNoteTouch[]>(() =>
    window.value.start !== null && query.data.value ? query.data.value : NONE,
  );

  return {
    touches,
    label: computed(() => window.value.label),
    loading: query.isLoading,
  };
}
