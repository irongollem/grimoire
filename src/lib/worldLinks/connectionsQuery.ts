/**
 * The connections read (#1084), apart from the pure word helpers in
 * `connections.ts` so a reader that only words ties (the public Open Book) does
 * not pull in the database client.
 */
import type { ConnectionKind, LinkKind } from "@edge-shared/worldLinkCatalogue.ts";
import { supabase } from "@/lib/supabase";
import { CONNECTIONS_KEY } from "@/lib/campaignLiveSync/registry";
import type { CanonEntry } from "@/types/canon.types";
import type { Connection } from "@/types/connections.types";

/**
 * The one query key for a thing's connections. Every reader (a sheet, a search
 * drill-in, the picker) uses it, so they share one cache entry and one refetch
 * when the campaign rings.
 */
export function connectionsQueryKey(kind: ConnectionKind, id: string, campaignId: string | null) {
  return [CONNECTIONS_KEY, kind, id, campaignId] as const;
}

/** Every tie of one thing, links and records, from its own side (`get_connections`). */
export async function fetchConnections(kind: LinkKind, id: string, campaignId: string | null): Promise<Connection[]> {
  const { data, error } = await supabase.rpc("get_connections", { p_kind: kind, p_id: id, p_campaign_id: campaignId });
  if (error) throw error;
  const connections = data as Connection[];
  if (kind !== "npc" || campaignId === null || !connections.some((connection) => connection.other_kind === "party_member")) return connections;

  const canonLinks = new Set(connections.filter((connection) =>
    connection.other_kind === "canon" && connection.source === "link" && connection.type === "about" && !connection.outward,
  ));
  if (canonLinks.size === 0) return connections;

  // Names can change or repeat. Read the backstory owner's id from the campaign's Canon.
  const { data: entries, error: canonError } = await supabase
    .from("canon_entries")
    .select("id, party_member_id")
    .eq("campaign_id", campaignId)
    .eq("part", "backstory")
    .in("id", Array.from(canonLinks, (connection) => connection.other_id));
  if (canonError) throw canonError;

  const backstoryRows = entries as Pick<CanonEntry, "id" | "party_member_id">[];
  const owners = new Map(backstoryRows.map((entry) => [entry.id, entry.party_member_id]));
  return connections.map((connection) => {
    if (!canonLinks.has(connection)) return connection;
    const owner = owners.get(connection.other_id);
    return owner ? { ...connection, backstory_party_member_id: owner } : connection;
  });
}
