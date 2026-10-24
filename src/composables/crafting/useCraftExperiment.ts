import { ref } from "vue";
import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { useCampaignMessages } from "@/composables/campaign/useCampaignMessages";
import { experimentChatMessage, parseExperimentResult, type ExperimentResult } from "@/lib/crafting/experiment";
import { supabase } from "@/lib/supabase";
import { reportHandledError } from "@/lib/observability/sentry";
import type { CraftingDiscipline } from "@/types/crafting.types";

interface ExperimentError {
  code?: string;
  message?: string;
}

/** The two refusals a player can cause, in words; anything else keeps the server's message. */
export function experimentErrorMessage(err: unknown): string {
  const code = typeof err === "object" && err !== null ? (err as ExperimentError).code : undefined;
  if (code === "42501") return "These items can't be used for experimenting.";
  if (code === "22023") return "Lay out between one and eight items.";
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

/**
 * The experiment bench's one action (#1103). Asks `craft_experiment`, which answers a match, a near
 * miss or nothing and spends nothing; on a match the finder's chat line is posted and the player's
 * recipes are re-read so the new one shows.
 */
export function useCraftExperiment(member: () => { id: string; name: string } | null) {
  const queryClient = useQueryClient();
  const { sendMessage } = useCampaignMessages();

  const result = ref<ExperimentResult | null>(null);
  const experimenting = ref(false);
  const experimentError = ref<string | null>(null);
  // The discovery happened; only the chat post failed. Never an error that invites another try.
  const chatNotice = ref<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (params: { memberId: string; discipline: CraftingDiscipline; rowIds: string[] }) => {
      const { data, error } = await supabase.rpc("craft_experiment", {
        p_party_member_id: params.memberId,
        p_discipline: params.discipline,
        p_row_ids: params.rowIds,
      });
      if (error) throw error;
      return parseExperimentResult(data);
    },
  });

  async function experiment(discipline: CraftingDiscipline, rowIds: string[]) {
    // A second press while one runs must not ask twice.
    if (experimenting.value) return;
    const who = member();
    if (!who) return;
    experimenting.value = true;
    experimentError.value = null;
    chatNotice.value = null;
    try {
      const res = await mutation.mutateAsync({ memberId: who.id, discipline, rowIds });
      result.value = res;
      if (res.result === "match") {
        await queryClient.invalidateQueries({ queryKey: ["crafting-recipes"] });
        await sendMessage(experimentChatMessage(who.name, res.name)).catch((e) => {
          reportHandledError(e, "craft-experiment-chat-post");
          chatNotice.value = "You found it, but the discovery could not be posted to the chat.";
        });
      }
    } catch (err) {
      experimentError.value = experimentErrorMessage(err);
    } finally {
      experimenting.value = false;
    }
  }

  function dismiss() {
    result.value = null;
    chatNotice.value = null;
  }

  return { result, experimenting, experimentError, chatNotice, experiment, dismiss };
}
