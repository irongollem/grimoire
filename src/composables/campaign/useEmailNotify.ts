import { supabase } from "@/lib/supabase";

/**
 * Fire-and-forget email (send-notification-email edge function). Only the
 * session-date proposal is emailed: email is for planning between sessions,
 * and anything shared at the table (notes, handouts) reaches players in the
 * app instead. See the function's header.
 *
 * Deliberately invoked from the client on the explicit DM action instead of a
 * DB trigger, so bulk write paths (campaign backup restore, imports) can never
 * mass-email a party — same reasoning as queueNoteEmbedding in useNotes.ts.
 * The function re-derives recipients and authorization server-side; these ids
 * are pointers, not grants. Failures are non-fatal: the share/proposal itself
 * already succeeded, and players still see it in-app.
 */

/** Email all players of the proposal's campaign about a new session date. */
export function notifyProposalCreated(proposalId: string): void {
  void supabase.functions
    .invoke("send-notification-email", {
      body: { type: "proposal_created", proposal_id: proposalId },
    })
    .catch(() => { /* non-fatal — see above */ });
}
