import { computed, type ComputedRef } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { useCampaignStore } from "@/stores/campaign";
import type { SessionFacts } from "@/lib/sessions/sessionLog";

/**
 * What each logged session contains, for the log's meta lines: people met
 * (distinct NPCs revealed during it) and encounters run in it. One read per
 * kind for the whole campaign, not one per row.
 *
 * The NPC read sits under the `npc-reveals` root so the world subscription's
 * existing invalidation of that root keeps it live; the encounter read rides
 * the `encounter_state` row events the campaign channel already carries.
 */
export function useSessionFacts(): ComputedRef<Map<string, SessionFacts>> {
  const campaign = useCampaignStore();

  const reveals = useQuery({
    queryKey: computed(() => ["npc-reveals", "by-session", campaign.activeCampaignId] as const),
    queryFn: async ({ queryKey: [, , cid] }) => {
      if (cid === null) throw new Error("useSessionFacts fetched without a campaign");
      return fetchAllRows<{ session_id: string; npc_id: string }>((from, to) =>
        supabase
          .from("npc_reveals")
          .select("session_id,npc_id")
          .eq("campaign_id", cid)
          .not("session_id", "is", null)
          .order("npc_id")
          .order("party_member_id")
          .range(from, to),
      );
    },
    enabled: () => !!campaign.activeCampaignId,
  });

  const encounters = useQuery({
    queryKey: computed(() => ["session-facts", "encounters", campaign.activeCampaignId] as const),
    queryFn: async ({ queryKey: [, , cid] }) => {
      if (cid === null) throw new Error("useSessionFacts fetched without a campaign");
      return fetchAllRows<{ session_id: string; encounter_id: string }>((from, to) =>
        supabase
          .from("encounter_state")
          .select("session_id,encounter_id")
          .eq("campaign_id", cid)
          .not("session_id", "is", null)
          .order("id")
          .range(from, to),
      );
    },
    enabled: () => !!campaign.activeCampaignId,
  });

  return computed(() => {
    const people = new Map<string, Set<string>>();
    for (const row of reveals.data.value ?? []) {
      const met = people.get(row.session_id) ?? new Set<string>();
      met.add(row.npc_id);
      people.set(row.session_id, met);
    }
    const fought = new Map<string, Set<string>>();
    for (const row of encounters.data.value ?? []) {
      const ran = fought.get(row.session_id) ?? new Set<string>();
      ran.add(row.encounter_id);
      fought.set(row.session_id, ran);
    }
    const facts = new Map<string, SessionFacts>();
    for (const id of new Set([...people.keys(), ...fought.keys()])) {
      facts.set(id, { people: people.get(id)?.size ?? 0, encounters: fought.get(id)?.size ?? 0 });
    }
    return facts;
  });
}

/**
 * How many distinct things the party learned outside any session: people, places
 * and handouts whose reveal carries no session. The number behind the log's
 * "Sort them" link.
 */
export function useUnsortedCount() {
  const campaign = useCampaignStore();
  return useQuery({
    queryKey: computed(() => ["npc-reveals", "unsorted-count", campaign.activeCampaignId] as const),
    queryFn: async ({ queryKey: [, , cid] }): Promise<number> => {
      if (cid === null) throw new Error("useUnsortedCount fetched without a campaign");
      const kinds = [
        { table: "npc_reveals", column: "npc_id" },
        { table: "location_reveals", column: "location_id" },
        { table: "handout_reveals", column: "document_id" },
      ] as const;
      let total = 0;
      for (const { table, column } of kinds) {
        const rows = await fetchAllRows<Record<string, string>>((from, to) =>
          supabase
            .from(table)
            .select(column)
            .eq("campaign_id", cid)
            .is("session_id", null)
            .order(column)
            .order("party_member_id")
            .range(from, to),
        );
        total += new Set(rows.map((row) => row[column])).size;
      }
      return total;
    },
    enabled: () => !!campaign.activeCampaignId,
  });
}
