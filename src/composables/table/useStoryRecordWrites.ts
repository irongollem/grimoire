import { reportHandledError } from "@/lib/observability/sentry";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { STORY_RECORD_KEY } from "@/lib/campaignLiveSync/registry";
import { checkCorrection, checkNewFact, type StoryFact } from "@/lib/table/solo/storyRecord";
import { useCampaignStore } from "@/stores/campaign";

function activeCampaign(): string {
  const id = useCampaignStore().activeCampaignId;
  if (!id) throw new Error("The record was written without a campaign");
  return id;
}

/**
 * Writes to the record. None of them ever updates a fact's sentence (the database refuses it): a correction is a new
 * fact that overtakes the old one, and the only thing that changes on an existing fact is `known_to_player`.
 * Each invalidates the record's key; the doorbell does the same for every other tab, this one just does not wait.
 */
export function useStoryRecordWrites() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: [STORY_RECORD_KEY] });

  /**
   * File `typed` as what is true instead of `original`. The correction keeps the original's hidden state, sitting and
   * ties, so it appears where the original did and is hidden from the party exactly as long as the original was.
   * The id is chosen here so the ties can be written after the fact without reading it back.
   */
  const correct = useMutation({
    mutationFn: async ({ original, typed }: { original: StoryFact; typed: string }): Promise<void> => {
      const checked = checkCorrection(original.body, typed);
      if (!checked.ok) throw new Error(checked.reason);
      const campaignId = activeCampaign();
      if (original.campaign_id !== campaignId) throw new Error("That fact belongs to another campaign");

      const { data: ties, error: tiesError } = await supabase
        .from("story_fact_links")
        .select("kind, npc_id, location_id, quest_id, quest_beat_id, item_id, monster_id")
        .eq("fact_id", original.id)
        .eq("campaign_id", campaignId);
      if (tiesError) throw tiesError;

      const id = crypto.randomUUID();
      const { error } = await supabase.from("story_facts").insert({
        id,
        campaign_id: campaignId,
        session_id: original.session_id,
        body: checked.body,
        known_to_player: original.known_to_player,
        supersedes_id: original.id,
        source: "correction",
      });
      if (error) throw error;

      if (ties.length > 0) {
        const { error: linkError } = await supabase
          .from("story_fact_links")
          .insert(ties.map((tie) => ({ ...tie, fact_id: id, campaign_id: campaignId })));
        if (linkError) {
          // A correction without the original's ties would be found by nothing: take it back rather than leave it.
          const { error: undoError } = await supabase.from("story_facts").delete().eq("id", id).eq("campaign_id", campaignId);
          // If taking it back fails too, a fact with no ties is left behind: say so, then report why the write failed.
          if (undoError) reportHandledError(undoError, "storyRecord.undoCorrection", { factId: id });
          throw linkError;
        }
      }
    },
    onSettled: refresh,
  });

  /** A DM puts a fact on record by hand, in the open sitting when there is one. No ties in this version. */
  const add = useMutation({
    mutationFn: async ({ typed, hidden }: { typed: string; hidden: boolean }): Promise<void> => {
      const checked = checkNewFact(typed);
      if (!checked.ok) throw new Error(checked.reason);
      const campaignId = activeCampaign();
      const { data: open, error: openError } = await supabase
        .from("campaign_sessions")
        .select("id")
        .eq("campaign_id", campaignId)
        .not("started_at", "is", null)
        .is("ended_at", null)
        .maybeSingle();
      if (openError) throw openError;
      const { error } = await supabase.from("story_facts").insert({
        campaign_id: campaignId,
        session_id: open ? (open as { id: string }).id : null,
        body: checked.body,
        known_to_player: !hidden,
        source: "dm",
      });
      if (error) throw error;
    },
    onSettled: refresh,
  });

  /** The party learns a hidden fact. The one change a fact on record allows. */
  const reveal = useMutation({
    mutationFn: async (factId: string): Promise<void> => {
      const { error } = await supabase
        .from("story_facts")
        .update({ known_to_player: true })
        .eq("id", factId)
        .eq("campaign_id", activeCampaign());
      if (error) throw error;
    },
    onSettled: refresh,
  });

  return { correct, add, reveal };
}
