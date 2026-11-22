import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { NPC_STARTER_PACKS_QUERY_KEY, validateNpcStarterPacks } from "@/composables/npcs/useNpcStarterPacks";
import type { NpcStarterInventoryPack } from "@/lib/npcGenerator/inventorySets";

export function useSaveNpcStarterPacks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draft: readonly NpcStarterInventoryPack[]) => {
      const packs = validateNpcStarterPacks(draft);
      const { error } = await supabase
        .from("app_settings")
        .upsert({
          key: "npc_starter_inventory_packs",
          value: packs.map(({ id, label, cues, items }) => ({ id, label, cues: [...cues], items: [...items] })),
        });
      if (error) throw error;
      return packs;
    },
    onMutate: () => queryClient.cancelQueries({ queryKey: NPC_STARTER_PACKS_QUERY_KEY }),
    onSuccess: (packs) => {
      queryClient.setQueryData(NPC_STARTER_PACKS_QUERY_KEY, packs);
    },
  });
}
