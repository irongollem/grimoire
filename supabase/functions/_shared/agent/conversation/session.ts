// Opening a conversation (#1253): one `agent_sessions` row, always written with its kind, so a function can tell its
// own conversations from another's (`gates.ts`). The server is the only writer of the table.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionKind } from "./gates.ts";

/**
 * Inserts a conversation of `kind` and returns the row with the columns asked for. `extra` is whatever that kind
 * also stores (the table's scene and play session); a column named there never overrides the kind.
 */
export async function insertAgentSession(
  admin: SupabaseClient,
  input: {
    kind: SessionKind;
    userId: string;
    campaignId: string;
    provider: string;
    model: string;
    extra?: Record<string, unknown>;
    columns: string;
  },
): Promise<Record<string, unknown>> {
  const { data, error } = await admin
    .from("agent_sessions")
    .insert({
      ...input.extra,
      user_id: input.userId,
      campaign_id: input.campaignId,
      kind: input.kind,
      provider: input.provider,
      model: input.model,
    })
    .select(input.columns)
    .single();
  if (error) throw error;
  return data as unknown as Record<string, unknown>;
}
