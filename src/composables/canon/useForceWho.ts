import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/toast";
import { useCampaignStore } from "@/stores/campaign";
import { CONNECTIONS_KEY } from "@/lib/campaignLiveSync/registry";
import { WHO_KINDS, forceWhoMap, isWhoTie, type ForceWho, type WhoKind } from "@/lib/canon/forceWho";
import { typeChoices } from "@/lib/worldLinks/connections";
import { useAllFactions } from "@/composables/factions/useFactions";
import { useAllDeities } from "@/composables/deities/useDeities";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useConnections, useCreateConnection, useRemoveConnection } from "@/composables/connections/useConnections";
import type { NamedRef } from "@/composables/connections/useConnections";
import type { Connection } from "@/types/connections.types";

/**
 * Who is behind each force (#1258 item 16, widened by #1279 item 11): the campaign's `about` links from a force to a
 * person, a faction or a god, read once for every force and joined to the records so a renamed one reads under its new
 * name. It sits under the connections root, which a `world_links` write rings and the connection writers refresh.
 */
async function fetchForceWhoLinks(campaignId: string): Promise<{ force_id: string; kind: WhoKind; id: string }[]> {
  const { data, error } = await supabase
    .from("world_links")
    .select("from_id, to_id, to_kind")
    .eq("campaign_id", campaignId)
    .eq("from_kind", "canon")
    .in("to_kind", [...WHO_KINDS])
    .eq("type", "about")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data.map((row) => ({ force_id: row.from_id, kind: row.to_kind as WhoKind, id: row.to_id }));
}

/** Read side, for a list: the who of any force, by name as it is now. */
export function useForceWho() {
  const campaign = useCampaignStore();
  const campaignId = computed(() => campaign.activeCampaignId);
  const { data: links } = useQuery({
    queryKey: computed(() => [CONNECTIONS_KEY, "force-who", campaignId.value] as const),
    queryFn: ({ queryKey: [, , cid] }) => {
      if (cid === null) throw new Error("useForceWho fetched without a campaign");
      return fetchForceWhoLinks(cid);
    },
    enabled: computed(() => !!campaignId.value),
  });
  const { data: npcs } = useNpcs();
  const { data: factions } = useAllFactions();
  const { data: deities } = useAllDeities();
  const who = computed(() => {
    const names = new Map<string, string>();
    for (const n of npcs.value ?? []) names.set(`npc:${n.id}`, n.name);
    for (const f of factions.value ?? []) names.set(`faction:${f.id}`, f.name);
    for (const d of deities.value ?? []) names.set(`deity:${d.id}`, d.name);
    return forceWhoMap(links.value ?? [], names);
  });
  return {
    /** The people, factions and gods behind a force, in the order they were named. */
    whoOf: (forceId: string): ForceWho[] => who.value.get(forceId) ?? [],
  };
}

/** Write side, for the open force: its who ties (the connections themselves, to remove them) and the two writes. */
export function useForceWhoTies(forceId: MaybeRefOrGetter<string>) {
  const query = useConnections("canon", forceId);
  const ties = computed<Connection[]>(() => (query.data.value ?? []).filter(isWhoTie));
  const create = useCreateConnection();
  const remove = useRemoveConnection();

  async function addWho(other: NamedRef & { kind: WhoKind }): Promise<void> {
    if (ties.value.some((c) => c.other_kind === other.kind && c.other_id === other.id)) return;
    const choice = typeChoices("canon", other.kind).find((c) => c.key === "about" && c.subjectIsFrom);
    if (!choice) throw new Error(`a canon entry cannot be about a ${other.kind}`);
    try {
      await create.mutateAsync({ subject: { kind: "canon", id: toValue(forceId) }, other, choice });
    } catch (e) {
      toast.error(toast.fromError(e));
    }
  }

  async function removeWho(tie: Connection): Promise<void> {
    try {
      await remove.mutateAsync({ connection: tie, subject: { kind: "canon", id: toValue(forceId) } });
    } catch (e) {
      toast.error(toast.fromError(e));
    }
  }

  return { ties, addWho, removeWho };
}
