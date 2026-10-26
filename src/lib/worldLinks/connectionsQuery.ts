/**
 * The connections read (#1084), apart from the pure word helpers in
 * `connections.ts` so a reader that only words ties (the public Open Book) does
 * not pull in the database client.
 */
import type { ConnectionKind, LinkKind } from "@edge-shared/worldLinkCatalogue.ts";
import { supabase } from "@/lib/supabase";
import { CONNECTIONS_KEY } from "@/lib/campaignLiveSync/registry";
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
  return data as Connection[];
}
