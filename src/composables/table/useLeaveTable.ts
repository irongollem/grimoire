import { ref } from "vue";
import { supabase } from "@/lib/supabase";

export interface LeaveOutcome {
  /** True when the campaign's play session was closed by this leave. */
  endedSession: boolean;
  /** The session note the sitting left behind, when there was anything on the record. */
  noteId: string | null;
}

/** Calls `agent-leave` and hands back the raw response. The seam a test replaces. */
export type LeaveTransport = (request: { campaignId: string; sessionId: string }) => Promise<Response>;

export const sendToAgentLeave: LeaveTransport = async (request) => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-leave`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    },
    body: JSON.stringify(request),
  });
};

/**
 * Gets up from the table for real: the server ends the session this sitting opened and files the record. It never
 * throws; a call that failed is `null`, so the caller can say so and still let the player go (nobody is kept at a
 * table by a failed request).
 */
export function useLeaveTable(transport: LeaveTransport = sendToAgentLeave) {
  const leaving = ref(false);

  async function leave(campaignId: string, sessionId: string): Promise<LeaveOutcome | null> {
    leaving.value = true;
    try {
      const response = await transport({ campaignId, sessionId });
      if (!response.ok) return null;
      const body: unknown = await response.json();
      if (typeof body !== "object" || body === null || !("endedSession" in body) || !("noteId" in body)) return null;
      return { endedSession: body.endedSession === true, noteId: typeof body.noteId === "string" ? body.noteId : null };
    } catch {
      return null;
    } finally {
      leaving.value = false;
    }
  }

  return { leaving, leave };
}
