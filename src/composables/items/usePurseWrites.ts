import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { Coins } from "@/lib/currency/currency";

/**
 * The two ways a client changes a purse. Both are one statement in the database
 * (`adjust_purse`, `set_purse_coin`), so they act on the purse as it is when they
 * run: a click on GP followed at once by a click on SP, or a coin drop crediting
 * the purse between a read and a write, can never overwrite each other. Nothing
 * here may write `party_members.coins` as a whole map.
 */
export function useAdjustPurse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, delta }: { memberId: string; delta: Coins }): Promise<void> => {
      const { error } = await supabase.rpc("adjust_purse", { p_member_id: memberId, p_delta: delta });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["party"] }),
  });
}

export function useSetPurseCoin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, key, count }: { memberId: string; key: string; count: number }): Promise<void> => {
      const { error } = await supabase.rpc("set_purse_coin", {
        p_member_id: memberId,
        p_key: key,
        p_count: count,
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["party"] }),
  });
}
