import { supabase } from "@/lib/supabase";

/**
 * Fire-and-forget email notifications (send-notification-email edge function).
 *
 * Deliberately invoked from the client on the explicit DM action instead of a
 * DB trigger, so bulk write paths (campaign backup restore, imports) can never
 * mass-email a party — same reasoning as queueNoteEmbedding in useNotes.ts.
 * The function re-derives recipients and authorization server-side; these ids
 * are pointers, not grants. Failures are non-fatal: the share/proposal itself
 * already succeeded, and players still see it in-app.
 */

/** Email the players newly granted visibility on a note (party_member ids). */
export function notifyNoteShared(noteId: string, addedPartyMemberIds: string[]): void {
  if (!addedPartyMemberIds.length) return;
  void supabase.functions
    .invoke("send-notification-email", {
      body: { type: "note_shared", note_id: noteId, added_party_member_ids: addedPartyMemberIds },
    })
    .catch(() => { /* non-fatal — see above */ });
}

/** Email all players of the proposal's campaign about a new session date. */
export function notifyProposalCreated(proposalId: string): void {
  void supabase.functions
    .invoke("send-notification-email", {
      body: { type: "proposal_created", proposal_id: proposalId },
    })
    .catch(() => { /* non-fatal — see above */ });
}
