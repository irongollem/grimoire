import { computed, ref } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";
import { toast } from "@/lib/toast";
import { CANON_KEY } from "@/lib/campaignLiveSync/registry";
import { useCreateCanonEntry } from "@/composables/canon/useCanonEntries";
import type { CanonLineRequest } from "@/types/canon.types";

/**
 * Lines and veils the players ask for in private (#1279 item 29). A player sends one through `ask_for_line_or_veil`
 * (the database stores it with the player's character only when they chose to sign it, and a player never reads the
 * table back); the DM reads every request and either adds it as a line or veil of the premise or lets it be. Sits under
 * the canon root, so the doorbell's `canon_line_requests` ring refreshes the DM's inbox.
 */

/** The longest request the table accepts. */
export const LINE_REQUEST_MAX = 300;

/** A request the DM has not yet added or let be. */
export const isOpenLineRequest = (r: Pick<CanonLineRequest, "adopted_entry_id" | "dismissed_at">) => r.adopted_entry_id === null && r.dismissed_at === null;

/** The words a player is told after asking: it says whether their name went with it. */
export function lineRequestSentMessage(signed: boolean): string {
  return signed ? "Sent to your DM, with your name." : "Sent to your DM. It does not show your name.";
}

/** A player asks for a line or veil. The words are trimmed; an empty or over-long request is refused before it is sent. */
export function useAskLineOrVeil() {
  const campaign = useCampaignStore();
  return useMutation({
    mutationFn: async ({ kind, body, signed }: { kind: "line" | "veil"; body: string; signed: boolean }): Promise<void> => {
      const cid = campaign.activeCampaignId;
      if (!cid) throw new Error("useAskLineOrVeil wrote without a campaign");
      const words = body.trim();
      if (words === "" || words.length > LINE_REQUEST_MAX) throw new Error(`A request is one to ${LINE_REQUEST_MAX} characters.`);
      const { error } = await supabase.rpc("ask_for_line_or_veil", { p_campaign_id: cid, p_kind: kind, p_body: words, p_signed: signed });
      if (error) throw error;
    },
    onError: (e) => toast.error(toast.fromError(e)),
  });
}

/** Every request in the campaign, for the DM, oldest first (the order they were asked in). */
export function useCampaignLineRequests() {
  const campaign = useCampaignStore();
  return useQuery({
    queryKey: computed(() => [CANON_KEY, "line-requests", campaign.activeCampaignId] as const),
    queryFn: async ({ queryKey: [, , cid] }): Promise<CanonLineRequest[]> => {
      if (!cid) throw new Error("useCampaignLineRequests fetched without a campaign");
      const { data, error } = await supabase.from("canon_line_requests").select("*").eq("campaign_id", cid).order("created_at", { ascending: true });
      if (error) throw error;
      return data as CanonLineRequest[];
    },
    enabled: () => !!campaign.activeCampaignId,
  });
}

async function updateRequest(id: string, patch: { adopted_entry_id: string } | { dismissed_at: string }): Promise<void> {
  // RLS answers a write it refuses with no error and no row; asking for the row back is how that is told from a save.
  const { data, error } = await supabase.from("canon_line_requests").update(patch).eq("id", id).select("id");
  if (error) throw error;
  if (data.length === 0) throw new Error("That request is gone, or you may not change it.");
}

/** The DM's two answers: add it as a line or veil (a premise entry made of the words), or let it be. */
export function useLineRequestActions() {
  const qc = useQueryClient();
  const { mutateAsync: createEntry } = useCreateCanonEntry();
  const refresh = () => qc.invalidateQueries({ queryKey: [CANON_KEY] });

  const letBe = useMutation({
    mutationFn: (id: string) => updateRequest(id, { dismissed_at: new Date().toISOString() }),
    onSuccess: refresh,
    onError: (e) => toast.error(toast.fromError(e)),
  });

  /** The requests being added right now: a second press while one is in flight would make the line twice. */
  const adopting = ref<ReadonlySet<string>>(new Set());

  /** The entry is made first, then the request points at it. A failed pointer never deletes the entry just made. */
  async function adopt(request: Pick<CanonLineRequest, "id" | "kind" | "body">, sortOrder: number): Promise<void> {
    if (adopting.value.has(request.id)) return;
    adopting.value = new Set([...adopting.value, request.id]);
    try {
      let entry;
      try {
        entry = await createEntry({ part: "premise", premise_kind: request.kind, title: request.body, sort_order: sortOrder });
      } catch {
        return; // The mutation has already told the DM (toast).
      }
      try {
        await updateRequest(request.id, { adopted_entry_id: entry.id });
      } catch {
        toast.error(`The ${request.kind} was added, but the request could not be marked as answered.`);
      }
      await refresh();
    } finally {
      adopting.value = new Set([...adopting.value].filter((id) => id !== request.id));
    }
  }

  return { adopt, adopting, letBe: (request: Pick<CanonLineRequest, "id">) => letBe.mutate(request.id) };
}
