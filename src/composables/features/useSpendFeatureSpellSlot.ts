import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import type { SpellSlotEntry } from "@/types/party.types";

/**
 * Spends one spell slot for a feature (Divine Smite, #976) without casting a
 * spell. The server authorizes it like the rests: the owner, the campaign DM or
 * the linked player. Only Spellcasting and Pact Magic slots can be spent this way.
 */
export function useSpendFeatureSpellSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      partyMemberId,
      slotLevel,
      pool,
    }: {
      partyMemberId: string;
      slotLevel: number;
      pool: "spellcasting" | "pact";
    }) => {
      const { data, error } = await supabase.rpc("spend_feature_spell_slot", {
        p_party_member_id: partyMemberId,
        p_slot_level: slotLevel,
        p_slot_pool: pool,
      });
      if (error) throw error;
      return data as unknown as SpellSlotEntry[];
    },
    onSuccess: (_data, { partyMemberId }) => {
      // The same keys useTakeSpellcastingRest refreshes after it changes a character.
      queryClient.invalidateQueries({ queryKey: ["party"] });
      queryClient.invalidateQueries({ queryKey: ["characterSpells", partyMemberId] });
      queryClient.invalidateQueries({ queryKey: ["characterSpellsDetails", partyMemberId] });
    },
  });
}
