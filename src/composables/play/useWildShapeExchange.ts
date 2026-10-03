import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { SpellSlotEntry } from "@/types/party.types";

export type WildShapeExchangeAction = "slot_for_healing" | "slot_for_use" | "use_for_slot";

/**
 * Atomic Wild Shape slot trades (`exchange_wild_shape`): Combat Wild Shape
 * healing (2014 Moon), and both Wild Resurgence directions (2024). One server
 * function so the slot, the use counter and the form's hit points cannot
 * disagree if one write lands and another does not.
 */
export function useWildShapeExchange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      partyMemberId,
      action,
      slotLevel,
      slotPool = "spellcasting",
      slotTemplate,
      healing = null,
    }: {
      partyMemberId: string;
      action: WildShapeExchangeAction;
      slotLevel: number;
      slotPool?: NonNullable<SpellSlotEntry["pool"]>;
      /** The effective slots, which the server spends from when the character has none stored yet. */
      slotTemplate: SpellSlotEntry[];
      healing?: number | null;
    }) => {
      const { data, error } = await supabase.rpc("exchange_wild_shape", {
        p_party_member_id: partyMemberId,
        p_action: action,
        p_slot_level: slotLevel,
        p_slot_pool: slotPool,
        p_slot_template: slotTemplate,
        p_healing: healing,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["party"] }),
  });
}
