import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { PLAYER_KIN_KEY } from "@/composables/kinship/usePlayerKin";
import type { PersonKey } from "@/types/kinship.types";

/** Sets a House's line of succession in one go; `line[0]` is the heir. Non-members are added as Member. */
export function useSetHouseSuccession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ factionId, line }: { factionId: string; line: PersonKey[] }): Promise<void> => {
      const { error } = await supabase.rpc("set_house_succession", { p_faction_id: factionId, p_line: line });
      if (error) throw error;
    },
    onSuccess: (_data, { factionId }) => {
      // Ranks live on the membership rows, and the join may have added members.
      for (const key of [
        ["faction-npcs", factionId],
        ["faction-party-members", factionId],
        ["faction-npcs", "all"],
        ["faction-party-members", "all"],
        ["npc-factions"],
        [PLAYER_KIN_KEY],
      ]) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}
