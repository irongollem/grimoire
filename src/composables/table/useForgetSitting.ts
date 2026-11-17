import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { useStorage } from "@vueuse/core";
import { supabase } from "@/lib/supabase";
import { safeLocalStorage } from "@/lib/safeLocalStorage";
import { TABLE_SESSIONS_KEY } from "@/composables/table/useTableSessions";
import type { KeptBoards } from "@/lib/table/boardKeep";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";

/**
 * Deletes a sitting at the AI table for good: the conversation, and the voice clips made for it, which only the
 * server can reach (`agent-forget`). What the sitting put on the campaign's record stays: that is the campaign's.
 * The fight lines this browser kept for it go too.
 */
export function useForgetSitting() {
  const queryClient = useQueryClient();
  const boards = useStorage<KeptBoards>("grimoire:ai-table-board", {}, safeLocalStorage());
  return useMutation({
    mutationFn: async (input: { campaignId: string; sessionId: string }): Promise<void> => {
      const { error } = await supabase.functions.invoke("agent-forget", { body: input });
      if (error) throw new Error(await edgeErrorMessage(error));
    },
    onSuccess: (_data, input) => {
      const { [input.sessionId]: _gone, ...rest } = boards.value;
      boards.value = rest;
      return queryClient.invalidateQueries({ queryKey: [TABLE_SESSIONS_KEY] });
    },
  });
}
