import { computed, ref } from "vue";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import { experimentChatMessage, parseExperimentResult } from "@/lib/crafting/experiment";
import { supabase } from "@/lib/supabase";
import { reportHandledError } from "@/lib/observability/sentry";
import type { CraftingDiscipline } from "@/types/crafting.types";

interface ExperimentError {
  code?: string;
  message?: string;
}

/**
 * The refusals a player can cause, in words; anything else keeps the server's message.
 * `craft_experiment` refuses the caller (42501: not seated on the character, or only minding it)
 * apart from a laid-out row (CX001), so neither is blamed on the other.
 */
export function experimentErrorMessage(err: unknown): string {
  const code = typeof err === "object" && err !== null ? (err as ExperimentError).code : undefined;
  if (code === "42501") return "Only this character's own player can experiment with their pack.";
  if (code === "CX001") return "These items can't be used for experimenting.";
  if (code === "22023") return "Lay out between one and eight items.";
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

interface ExperimentVars {
  member: { id: string; name: string };
  discipline: CraftingDiscipline;
  rowIds: string[];
}

/**
 * The experiment bench's one action (#1103). Asks `craft_experiment`, which answers a match, a near
 * miss or nothing and spends nothing; on a match the finder's chat line is posted and the player's
 * recipes are re-read so the new one shows. In flight, the answer and the error are the mutation's
 * own state.
 */
export function useCraftExperiment(member: () => { id: string; name: string } | null) {
  const queryClient = useQueryClient();
  const { sendMessage } = useCampaignMessages();

  // The discovery happened; only the chat post failed. Never an error that invites another try.
  const chatNotice = ref<string | null>(null);

  const mutation = useMutation({
    mutationFn: async ({ member: who, discipline, rowIds }: ExperimentVars) => {
      const { data, error } = await supabase.rpc("craft_experiment", {
        p_party_member_id: who.id,
        p_discipline: discipline,
        p_row_ids: rowIds,
      });
      if (error) throw error;
      return parseExperimentResult(data);
    },
    // Awaited before the mutation settles, so the button stays busy until the find is announced.
    onSuccess: async (res, { member: who }) => {
      if (res.result !== "match") return;
      await queryClient.invalidateQueries({ queryKey: ["crafting-recipes"] });
      await sendMessage(experimentChatMessage(who.name, res.name)).catch((e) => {
        reportHandledError(e, "craft-experiment-chat-post");
        chatNotice.value = "You found it, but the discovery could not be posted to the chat.";
      });
    },
  });

  const result = computed(() => mutation.data.value ?? null);
  const experimenting = computed(() => mutation.isPending.value);
  const experimentError = computed(() => (mutation.error.value ? experimentErrorMessage(mutation.error.value) : null));

  function experiment(discipline: CraftingDiscipline, rowIds: string[]) {
    // A second press while one runs must not ask twice.
    if (mutation.isPending.value) return;
    const who = member();
    if (!who) return;
    chatNotice.value = null;
    mutation.mutate({ member: who, discipline, rowIds });
  }

  /** The bench changed under a refusal, so the refusal no longer describes it. */
  function clearError() {
    if (mutation.isError.value) mutation.reset();
  }

  function dismiss() {
    mutation.reset();
    chatNotice.value = null;
  }

  return { result, experimenting, experimentError, chatNotice, experiment, clearError, dismiss };
}
