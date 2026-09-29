/**
 * Email the parents a campaign join request (#927) is waiting on. Shared by
 * notify-join-request (the joiner's own join page) and child-account (a
 * parent creating a child whose invite needs the other family's approval).
 *
 * `notified_at` is claimed with a conditional update before anything is sent,
 * so two concurrent calls cannot both mail; it is cleared again when every
 * send failed, so a retry can succeed. Copy is fixed (joinRequestEmail.ts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resendApiKey, sendEmail } from "./resend.ts";
import { checkRateLimit } from "./rate-limit.ts";
import { joinRequestEmail, type JoinRequestRole } from "./joinRequestEmail.ts";

export interface NotifyResult {
  status: "sent" | "already" | "not_configured" | "not_found" | "nothing_to_send" | "failed";
  /** Approvers skipped because their daily email limit was hit. */
  rateLimited: number;
}

interface Approver {
  id: string;
  role: JoinRequestRole;
}

export async function notifyJoinRequest(admin: SupabaseClient, requestId: string): Promise<NotifyResult> {
  const { data: request, error } = await admin
    .from("campaign_join_requests")
    .select("joiner_parent_id, joiner_parent_approved_at, dm_parent_id, dm_parent_approved_at, notified_at")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  if (!request) return { status: "not_found", rateLimited: 0 };
  if (request.notified_at !== null) return { status: "already", rateLimited: 0 };

  const apiKey = resendApiKey();
  if (!apiKey) return { status: "not_configured", rateLimited: 0 };

  const joinerParent = request.joiner_parent_approved_at === null ? (request.joiner_parent_id as string | null) : null;
  const dmParent = request.dm_parent_approved_at === null ? (request.dm_parent_id as string | null) : null;
  const approvers: Approver[] = [];
  if (joinerParent !== null && joinerParent === dmParent) {
    approvers.push({ id: joinerParent, role: "both" });
  } else {
    if (joinerParent !== null) approvers.push({ id: joinerParent, role: "joiner" });
    if (dmParent !== null) approvers.push({ id: dmParent, role: "dm" });
  }
  if (approvers.length === 0) return { status: "nothing_to_send", rateLimited: 0 };

  // Claim before sending: only the call that flips notified_at from null mails.
  const { data: claimed, error: claimError } = await admin
    .from("campaign_join_requests")
    .update({ notified_at: new Date().toISOString() })
    .eq("id", requestId)
    .is("notified_at", null)
    .select("id");
  if (claimError) throw claimError;
  if (!claimed || claimed.length === 0) return { status: "already", rateLimited: 0 };

  const appOrigin = (Deno.env.get("APP_URL") ?? "https://app.dungeongrimoire.com").replace(/\/+$/, "");
  const familyUrl = `${appOrigin}/account/family`;

  let sent = 0;
  let attempted = 0;
  let rateLimited = 0;
  for (const approver of approvers) {
    if (!(await checkRateLimit(admin, approver.id, "join_request_parent"))) {
      rateLimited += 1;
      continue;
    }
    const { data, error: userError } = await admin.auth.admin.getUserById(approver.id);
    const to = data?.user?.email;
    if (userError || !to) {
      console.error("notifyJoinRequest: approver has no email", userError);
      continue;
    }
    attempted += 1;
    if (await sendEmail(apiKey, { to, content: joinRequestEmail({ role: approver.role, familyUrl }) })) sent += 1;
  }

  if (sent === 0) {
    // Nothing went out, so let a later call try again.
    const { error: clearError } = await admin
      .from("campaign_join_requests")
      .update({ notified_at: null })
      .eq("id", requestId);
    if (clearError) console.error("notifyJoinRequest: could not clear notified_at", clearError);
    return { status: attempted === 0 && rateLimited > 0 ? "nothing_to_send" : "failed", rateLimited };
  }
  return { status: "sent", rateLimited };
}
