import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useCampaignSession } from "@/composables/campaign/useCampaignSession";
import { useCampaignSessions } from "@/composables/sessions/useCampaignSessions";
import type { DmNoteTouch } from "@/types/dmNote.types";

const NONE: readonly DmNoteTouch[] = Object.freeze([]);

/**
 * The entities the DM wrote notes on in the current window: since the running
 * session began, else during the run session that ended last. No window, no
 * entries. The live session is only the open row, so the last ended one comes
 * from the session log (#985); a session logged by hand never ran, has no
 * start, and so cannot be the window.
 */
export function useDmNoteTouches() {
  const auth = useAuthStore();
  const campaign = useCampaignStore();
  const { session, isRunning } = useCampaignSession();
  const log = useCampaignSessions({ enabled: () => !isRunning.value });

  const lastEnded = computed(() => {
    let latest: { start: string; end: string } | null = null;
    for (const row of log.data.value ?? []) {
      if (!row.started_at || !row.ended_at) continue;
      if (!latest || row.ended_at > latest.end) latest = { start: row.started_at, end: row.ended_at };
    }
    return latest;
  });

  const window = computed(() => {
    const open = session.value;
    if (isRunning.value && open?.started_at) return { start: open.started_at, end: null, label: "This session" };
    const last = lastEnded.value;
    if (last) return { start: last.start, end: last.end, label: "Last session" };
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
