import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";

export interface ItemHolder {
  type: "npc" | "party_member" | "shop";
  id: string;
  name: string;
  quantity: number;
  /** route to navigate to this holder */
  to: string;
}

export function useItemHolders(itemId: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => ["item-holders", toValue(itemId)]),
    queryFn: async (): Promise<ItemHolder[]> => {
      const id = toValue(itemId);
      if (!id) return [];

      const [npcRes, partyRes, shopRes] = await Promise.all([
        supabase
          .from("npc_inventory")
          .select("npc_id, quantity, npc:npcs(id, name)")
          .eq("item_id", id),
        supabase
          .from("party_inventory")
          .select("carried_by, quantity, party_member:party_members!carried_by(id, name)")
          .eq("item_id", id)
          .not("carried_by", "is", null),
        supabase
          .from("store_items")
          .select("location_id, location:locations(id, name)")
          .eq("item_id", id),
      ]);

      const holders: ItemHolder[] = [];

      for (const row of npcRes.data ?? []) {
        const npc = row.npc as unknown as { id: string; name: string } | null;
        if (npc) {
          holders.push({
            type: "npc",
            id: npc.id,
            name: npc.name,
            quantity: row.quantity,
            to: `/npcs/${npc.id}`,
          });
        }
      }

      for (const row of partyRes.data ?? []) {
        const member = row.party_member as unknown as { id: string; name: string } | null;
        if (member) {
          holders.push({
            type: "party_member",
            id: member.id,
            name: member.name,
            quantity: row.quantity,
            to: `/party`,
          });
        }
      }

      for (const row of shopRes.data ?? []) {
        const loc = row.location as unknown as { id: string; name: string } | null;
        if (loc) {
          holders.push({
            type: "shop",
            id: loc.id,
            name: loc.name,
            quantity: 1,
            to: `/locations/${loc.id}`,
          });
        }
      }

      return holders;
    },
    enabled: computed(() => !!toValue(itemId)),
  });
}
