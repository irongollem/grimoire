import { computed } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import { inventionChatMessage, parseInvention } from "@/lib/crafting/invention";
import { supabase } from "@/lib/supabase";
import { reportHandledError } from "@/lib/observability/sentry";
import type { CraftingInvention } from "@/types/crafting.types";

/** The doorbell rings this prefix for the `crafting_inventions` signal. */
export const INVENTIONS_KEY = "crafting-inventions";

/** The longest note a DM may send back; the server refuses more. */
export const INVENTION_NOTE_MAX = 1000;

export interface PendingInvention {
  invention: CraftingInvention;
  characterName: string;
}

interface DecideError {
  code?: string;
  message?: string;
}

/** The refusals a DM can meet, in words; anything else keeps the server's message. */
export function inventionDecisionErrorMessage(err: unknown): string {
  const code = typeof err === "object" && err !== null ? (err as DecideError).code : undefined;
  if (code === "42501") return "Only a DM of this campaign can decide.";
  if (code === "CX003") return "This draft is no longer waiting for you.";
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

/** Drafts the players sent to the DM, oldest first, each beside the name of the character who invented it. */
export function usePendingInventions(campaignId: () => string | null) {
  return useQuery({
    queryKey: computed(() => [INVENTIONS_KEY, "campaign", campaignId()] as const),
    queryFn: async ({ queryKey: [, , cid] }): Promise<PendingInvention[]> => {
      if (cid === null) throw new Error("usePendingInventions fetched without a campaign");
      const { data, error } = await supabase
        .from("crafting_inventions")
        .select("*, party_members(name)")
        .eq("campaign_id", cid)
        .eq("status", "pending")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data.map((row) => {
        const { party_members: member, ...rest } = row as Record<string, unknown> & {
          party_members: { name: string } | null;
        };
        return {
          invention: parseInvention(rest),
          // The party row can be gone while the draft waits; a neutral name beats a blank.
          characterName: member ? member.name : "A character at your table",
        };
      });
    },
    enabled: () => !!campaignId(),
  });
}

/** Approve or send back. Neither navigates: the ring takes the card out of the queue. */
export function useDecideInvention() {
  const queryClient = useQueryClient();
  const { sendMessage } = useCampaignMessages();

  const decide = useMutation({
    mutationFn: async (vars: { id: string; decision: "approve" | "return"; note?: string }) => {
      const { error } = await supabase.rpc("decide_crafting_invention", {
        p_invention_id: vars.id,
        p_decision: vars.decision,
        ...(vars.note !== undefined ? { p_note: vars.note } : {}),
      });
      if (error) throw error;
    },
  });

  /** Resolves with a notice when only the chat post failed; the approval itself stands. */
  async function approve(invention: CraftingInvention, characterName: string): Promise<{ chatNotice: string | null }> {
    await decide.mutateAsync({ id: invention.id, decision: "approve" });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: [INVENTIONS_KEY] }),
      queryClient.invalidateQueries({ queryKey: ["crafting-recipes"] }),
      queryClient.invalidateQueries({ queryKey: ["items"] }),
    ]);
    try {
      await sendMessage(inventionChatMessage(characterName, invention.draft.item.name));
      return { chatNotice: null };
    } catch (e) {
      reportHandledError(e, "invention-approve-chat-post");
      return { chatNotice: "Approved, but the announcement could not be posted to the chat." };
    }
  }

  async function returnWithNote(invention: CraftingInvention, note: string): Promise<void> {
    const trimmed = note.trim();
    if (trimmed.length < 1 || trimmed.length > INVENTION_NOTE_MAX) {
      throw new Error(`Write a note of 1 to ${INVENTION_NOTE_MAX} characters.`);
    }
    await decide.mutateAsync({ id: invention.id, decision: "return", note: trimmed });
    await queryClient.invalidateQueries({ queryKey: [INVENTIONS_KEY] });
  }

  return { approve, returnWithNote, deciding: computed(() => decide.isPending.value) };
}

/** The DM throws a draft away. */
export function useDiscardInvention() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crafting_inventions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [INVENTIONS_KEY] }),
  });
}
