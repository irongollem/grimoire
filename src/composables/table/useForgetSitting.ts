import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { TABLE_SESSIONS_KEY } from "@/composables/table/useTableSessions";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";

/**
 * Deletes a sitting at the AI table for good: the conversation, and the voice clips made for it, which only the
 * server can reach (`agent-forget`). What the sitting put on the campaign's record stays: that is the campaign's.
 * The fight lines kept beside its turns go with the conversation.
 */
export function useForgetSitting() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { campaignId: string; sessionId: string }): Promise<void> => {
      const { error } = await supabase.functions.invoke("agent-forget", { body: input });
      if (error) throw new Error(await edgeErrorMessage(error));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [TABLE_SESSIONS_KEY] }),
  });
}
