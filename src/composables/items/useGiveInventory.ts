import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/composables/useToast";
import type { CoinKey } from "@/types/downtime.types";

/**
 * Handing things between packs (#1112). A player may write only their own pack and
 * the stash (`private.can_write_pack`), so a give into another character's pack goes
 * through a definer that authorizes the pack it comes OUT of: nobody can take.
 *
 * Both sides refresh from the campaign ring the writes send; the invalidation here
 * only makes the giver's own screen immediate.
 */

export interface GiveItemArgs {
  itemId: string;
  /** The receiving party member, or null for the party stash. */
  toMemberId: string | null;
  /** Part of a stack; omit to give the whole row (a container always goes whole). */
  quantity?: number;
}

export function useGiveInventoryItem() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: async ({ itemId, toMemberId, quantity }: GiveItemArgs): Promise<string> => {
      const { data, error } = await supabase.rpc("give_inventory_item", {
        p_item_id: itemId,
        p_to_member_id: toMemberId,
        p_quantity: quantity ?? null,
      });
      if (error) throw error;
      return data as string;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["party-inventory"] }),
    onError: (e) => toast.error(toast.fromError(e, "Couldn't hand that over.")),
  });
}

export interface GiveCoinsArgs {
  fromMemberId: string;
  toMemberId: string;
  coins: Record<CoinKey, number>;
}

export function useGiveCoins() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: async ({ fromMemberId, toMemberId, coins }: GiveCoinsArgs): Promise<void> => {
      const { error } = await supabase.rpc("give_coins", {
        p_from_member_id: fromMemberId,
        p_to_member_id: toMemberId,
        p_pp: coins.pp,
        p_gp: coins.gp,
        p_ep: coins.ep,
        p_sp: coins.sp,
        p_cp: coins.cp,
      });
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["party"] }),
    onError: (e) => toast.error(toast.fromError(e, "Couldn't hand over the coins.")),
  });
}
