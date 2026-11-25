import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { toast } from "@/lib/toast";
import { useCampaignStore } from "@/stores/campaign";
import type { CanonTonightPin } from "@/types/canon.types";

/**
 * Tonight's plan (#1279 item 20): what the DM pinned for the next session and the one line of what they mean to happen.
 * Both are the DM's alone (RLS), live under the canon query root (so the doorbell keeps them fresh) and are written here.
 */

/** The thing a pin names: exactly one id, as the table's check demands. */
export type PinTarget = { clue_id: string } | { passage_id: string } | { step_id: string } | { entry_id: string };

export const PLAN_LINE_MAX = 500;

/** The column and id a target names, for matching a pin to the row it was made from. */
export function pinTargetOf(pin: Pick<CanonTonightPin, "clue_id" | "passage_id" | "step_id" | "entry_id">): PinTarget | null {
  if (pin.clue_id !== null) return { clue_id: pin.clue_id };
  if (pin.passage_id !== null) return { passage_id: pin.passage_id };
  if (pin.step_id !== null) return { step_id: pin.step_id };
  if (pin.entry_id !== null) return { entry_id: pin.entry_id };
  return null;
}

/** The pin that names this target, if any. */
export function pinFor(pins: readonly CanonTonightPin[], target: PinTarget): CanonTonightPin | undefined {
  const [[column, id]] = Object.entries(target);
  return pins.find((p) => (p as unknown as Record<string, unknown>)[column] === id);
}

/** The new order after moving one pin a place: every pin whose index changed gets it as its `sort_order`. Pure. */
export function reorderedPins(orderedIds: readonly string[], id: string, direction: -1 | 1): { id: string; sort_order: number }[] {
  const from = orderedIds.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= orderedIds.length) return [];
  const next = [...orderedIds];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next.flatMap((pinId, index) => (pinId === orderedIds[index] ? [] : [{ id: pinId, sort_order: index }]));
}

function useCampaignId() {
  const campaign = useCampaignStore();
  return computed(() => campaign.activeCampaignId);
}

export function useTonightPins() {
  const campaignId = useCampaignId();
  return useQuery({
    queryKey: computed(() => [CANON_KEY, "tonight-pins", campaignId.value] as const),
    queryFn: async ({ queryKey: [, , cid] }): Promise<CanonTonightPin[]> => {
      if (cid === null) throw new Error("useTonightPins fetched without a campaign");
      const { data, error } = await supabase.from("canon_tonight_pins").select("*").eq("campaign_id", cid).order("sort_order").order("created_at");
      if (error) throw error;
      return (data ?? []) as CanonTonightPin[];
    },
    enabled: computed(() => !!campaignId.value),
  });
}

/** The DM's one line for the next session; null when none is written. */
export function useTonightPlanLine() {
  const campaignId = useCampaignId();
  return useQuery({
    queryKey: computed(() => [CANON_KEY, "tonight-plan", campaignId.value] as const),
    queryFn: async ({ queryKey: [, , cid] }): Promise<string | null> => {
      if (cid === null) throw new Error("useTonightPlanLine fetched without a campaign");
      const { data, error } = await supabase.from("canon_tonight_plans").select("body").eq("campaign_id", cid).maybeSingle();
      if (error) throw error;
      return (data as { body: string } | null)?.body ?? null;
    },
    enabled: computed(() => !!campaignId.value),
  });
}

/** Writes the line: empty removes the row (an empty plan is no plan), anything else is one row per campaign. */
export async function writePlanLine(campaignId: string, body: string): Promise<void> {
  const text = body.trim();
  if (text === "") {
    const { error } = await supabase.from("canon_tonight_plans").delete().eq("campaign_id", campaignId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from("canon_tonight_plans").upsert({ campaign_id: campaignId, body: text.slice(0, PLAN_LINE_MAX) }, { onConflict: "campaign_id" });
  if (error) throw error;
}

export function useSavePlanLine() {
  const campaignId = useCampaignId();
  const qc = useQueryClient();
  return async (body: string) => {
    if (campaignId.value === null) throw new Error("No campaign to plan for");
    await writePlanLine(campaignId.value, body);
    await qc.invalidateQueries({ queryKey: [CANON_KEY, "tonight-plan"] });
  };
}

/** Pin, unpin and reorder. Each refreshes the canon and tells the DM when it fails. */
export function useTonightPinWrites(pins: () => readonly CanonTonightPin[]) {
  const campaignId = useCampaignId();
  const qc = useQueryClient();
  const settle = { onSuccess: () => qc.invalidateQueries({ queryKey: [CANON_KEY] }), onError: (e: unknown) => toast.error(toast.fromError(e)) };

  const pin = useMutation({
    mutationFn: async (target: PinTarget) => {
      if (campaignId.value === null) throw new Error("No campaign to pin in");
      const next = pins().reduce((max, p) => Math.max(max, p.sort_order), -1) + 1;
      const { error } = await supabase.from("canon_tonight_pins").insert({ campaign_id: campaignId.value, sort_order: next, ...target });
      if (error) throw error;
    },
    ...settle,
  });
  const unpin = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("canon_tonight_pins").delete().eq("id", id);
      if (error) throw error;
    },
    ...settle,
  });
  const move = useMutation({
    mutationFn: async ({ orderedIds, id, direction }: { orderedIds: readonly string[]; id: string; direction: -1 | 1 }) => {
      const results = await Promise.all(
        reorderedPins(orderedIds, id, direction).map((c) => supabase.from("canon_tonight_pins").update({ sort_order: c.sort_order }).eq("id", c.id)),
      );
      for (const r of results) if (r.error) throw r.error;
    },
    ...settle,
  });

  /** Pins the target when it is not pinned, unpins it when it is. */
  function toggle(target: PinTarget) {
    const existing = pinFor(pins(), target);
    if (existing) unpin.mutate(existing.id);
    else pin.mutate(target);
  }
  return { toggle, unpin: (id: string) => unpin.mutate(id), move: (orderedIds: readonly string[], id: string, direction: -1 | 1) => move.mutate({ orderedIds, id, direction }) };
}

/** "Leave it": a loose end the DM means to leave stops being listed; `left: false` takes it back. */
export function useLeaveLooseEnd() {
  const qc = useQueryClient();
  const campaignId = useCampaignId();
  return useMutation({
    // An arc is left on its own row (`canon_arcs`), everything else on its entry.
    mutationFn: async ({ id, arc, left }: { id: string; arc: boolean; left: boolean }) => {
      if (campaignId.value === null) throw new Error("No campaign to leave a loose end in");
      const { error } = await supabase
        .from(arc ? "canon_arcs" : "canon_entries")
        .update({ loose_end_left_at: left ? new Date().toISOString() : null })
        .eq("id", id)
        .eq("campaign_id", campaignId.value);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CANON_KEY] }),
    onError: (e) => toast.error(toast.fromError(e)),
  });
}
