/**
 * Ask Grimoire (#1253): the names of the records a proposal's `links` point at, read from THIS campaign.
 *
 * The model can name any id it has seen, so a link is trusted only once its record is found here: one query per kind,
 * `campaign_id` and the ids in the filter, so another campaign's row is "not found" exactly like one that does not
 * exist. Read only while a proposal names a tie (the adapter lives as long as the panel, and a closed panel must cost
 * no egress), and only the id and the name column.
 */
import { computed } from "vue";
import { useQuery } from "@tanstack/vue-query";
import type { LinkKind } from "@edge-shared/worldLinkCatalogue.ts";
import type { AskLink } from "@edge-shared/agent/askLinks";
import { supabase } from "@/lib/supabase";
import { useCampaignStore } from "@/stores/campaign";

type NameRow = { id: string; name: string };

/** One kind's rows by id, in this campaign. Each kind has its own table and name column, so each is its own query. */
async function namesOf(kind: LinkKind, campaignId: string, ids: string[]): Promise<NameRow[]> {
  switch (kind) {
    case "npc": {
      const { data, error } = await supabase.from("npcs").select("id, name").eq("campaign_id", campaignId).in("id", ids);
      if (error) throw error;
      return data;
    }
    case "party_member": {
      const { data, error } = await supabase.from("party_members").select("id, name").eq("campaign_id", campaignId).in("id", ids);
      if (error) throw error;
      return data;
    }
    case "faction": {
      const { data, error } = await supabase.from("factions").select("id, name").eq("campaign_id", campaignId).in("id", ids);
      if (error) throw error;
      return data;
    }
    case "location": {
      const { data, error } = await supabase.from("locations").select("id, name").eq("campaign_id", campaignId).in("id", ids);
      if (error) throw error;
      return data;
    }
    case "deity": {
      const { data, error } = await supabase.from("deities").select("id, name").eq("campaign_id", campaignId).in("id", ids);
      if (error) throw error;
      return data;
    }
    case "item": {
      const { data, error } = await supabase.from("items").select("id, name").eq("campaign_id", campaignId).in("id", ids);
      if (error) throw error;
      return data;
    }
    case "canon": {
      const { data, error } = await supabase.from("canon_entries").select("id, title").eq("campaign_id", campaignId).in("id", ids);
      if (error) throw error;
      return data.map((row) => ({ id: row.id, name: row.title }));
    }
  }
}

/** `kind:id` to name for the links that exist in this campaign. */
export async function readLinkNames(campaignId: string, links: readonly AskLink[]): Promise<Map<string, string>> {
  const byKind = new Map<LinkKind, string[]>();
  for (const link of links) byKind.set(link.kind, [...(byKind.get(link.kind) ?? []), link.id]);
  const names = new Map<string, string>();
  for (const [kind, ids] of byKind) {
    for (const row of await namesOf(kind, campaignId, ids)) {
      if (typeof row.name === "string" && row.name.trim() !== "") names.set(`${kind}:${row.id}`, row.name.trim());
    }
  }
  return names;
}

export function useAskLinkRecords(wanted: () => readonly AskLink[]) {
  const campaign = useCampaignStore();
  const signature = computed(() => wanted().map((l) => `${l.kind}:${l.id}`).sort().join(","));
  const query = useQuery({
    queryKey: computed(() => ["ask-link-records", campaign.activeCampaignId, signature.value] as const),
    queryFn: () => {
      const campaignId = campaign.activeCampaignId;
      if (campaignId === null) throw new Error("useAskLinkRecords read without a campaign");
      return readLinkNames(campaignId, wanted());
    },
    enabled: computed(() => campaign.activeCampaignId !== null && wanted().length > 0),
  });
  return {
    /** Undefined until the read lands; an empty map when no named record is this campaign's. */
    names: computed(() => query.data.value),
    /** A proposal names ties and their records are not read yet. */
    loading: computed(() => wanted().length > 0 && query.data.value === undefined && !query.isError.value),
    failed: computed(() => query.isError.value),
  };
}
