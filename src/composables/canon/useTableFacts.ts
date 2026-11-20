import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { CANON_KEY, STORY_RECORD_KEY } from "@/lib/campaignLiveSync/registry";
import { keepPatch, strikePatch, truthFromFact, undoStrikePatch } from "@/lib/canon/canonTableFacts";
import { createCanonEntry } from "@/composables/canon/useCanonEntries";
import { useStoryRecord } from "@/composables/table/useStoryRecord";
import { useStoryRecordWrites } from "@/composables/table/useStoryRecordWrites";
import type { StoryFact } from "@/lib/table/solo/storyRecord";
import { useCampaignStore } from "@/stores/campaign";

function activeCampaign(): string {
  const id = useCampaignStore().activeCampaignId;
  if (!id) throw new Error("The record was changed without a campaign");
  return id;
}

/**
 * Stamp a fact's review columns. RLS answers a write it refuses with no error and no row, so the row is asked for back:
 * a Keep or Strike that matched nothing is a failure, never a silent success.
 */
export async function reviewFact(factId: string, patch: { kept_at: string | null; struck_at: string | null }): Promise<void> {
  const { data, error } = await supabase
    .from("story_facts")
    .update(patch)
    .eq("id", factId)
    .eq("campaign_id", activeCampaign())
    .select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("That fact is gone, or you may not change it.");
}

/**
 * Make it a truth: a canon truth with the fact's words, then the fact kept. The truth goes first, so a failure part-way
 * leaves a fact still waiting for review rather than a keep with nothing behind it.
 */
export async function makeFactATruth(fact: StoryFact, sortOrder: number, now: Date = new Date()): Promise<string> {
  const created = await createCanonEntry(activeCampaign(), { ...truthFromFact(fact), sort_order: sortOrder });
  await reviewFact(fact.id, keepPatch(now));
  return created.id;
}

/** The record the page reads, shared with the story view: the doorbell refreshes it (`STORY_RECORD_KEY`). */
export function useTableFacts() {
  return useStoryRecord();
}

/** The DM's review of what the table added. Each write refreshes the record; the doorbell does it for every other tab. */
export function useTableFactWrites() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: [STORY_RECORD_KEY] });
  const { correct } = useStoryRecordWrites();

  const keep = useMutation({ mutationFn: (fact: StoryFact) => reviewFact(fact.id, keepPatch()), onSettled: refresh });
  const strike = useMutation({ mutationFn: (fact: StoryFact) => reviewFact(fact.id, strikePatch()), onSettled: refresh });
  const undoStrike = useMutation({
    mutationFn: ({ fact, previousKeptAt }: { fact: StoryFact; previousKeptAt: string | null }) => reviewFact(fact.id, undoStrikePatch(previousKeptAt)),
    onSettled: refresh,
  });
  const makeTruth = useMutation({
    mutationFn: ({ fact, sortOrder }: { fact: StoryFact; sortOrder: number }) => makeFactATruth(fact, sortOrder),
    onSettled: () => Promise.all([refresh(), queryClient.invalidateQueries({ queryKey: [CANON_KEY] })]),
  });

  return { keep, strike, undoStrike, makeTruth, correct };
}
