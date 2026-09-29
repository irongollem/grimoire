/**
 * Email the parents a campaign join request (#927) is waiting on. Shared by
 * notify-join-request (the joiner's own join page) and child-account (a
 * parent creating a child whose invite needs the other family's approval).
 *
 * Each parent's `*_notified_at` is claimed with a conditional update before
 * their email is sent, so two concurrent calls cannot both mail; it is cleared
 * again when the send failed, and a parent skipped by the rate limit is left
 * unclaimed, so a later call reaches them. Copy is fixed (joinRequestEmail.ts).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resendApiKey, sendEmail } from "./resend.ts";
import { checkRateLimit } from "./rate-limit.ts";
import { joinRequestEmail, type JoinRequestRole } from "./joinRequestEmail.ts";

export interface NotifyResult {
  status: "sent" | "already" | "not_configured" | "not_found" | "nothing_to_send" | "failed";
  /** Approvers skipped because their daily email limit was hit. They stay
   *  un-notified, so a later call for this request reaches them. */
  rateLimited: number;
}

type NotifiedColumn = "joiner_parent_notified_at" | "dm_parent_notified_at";

interface Approver {
  id: string;
  role: JoinRequestRole;
  /** The columns this email answers for: both, when one parent is on both sides. */
  columns: NotifiedColumn[];
}

export async function notifyJoinRequest(admin: SupabaseClient, requestId: string): Promise<NotifyResult> {
  const { data: request, error } = await admin
    .from("campaign_join_requests")
    .select(
      "joiner_parent_id, joiner_parent_approved_at, joiner_parent_notified_at, dm_parent_id, dm_parent_approved_at, dm_parent_notified_at",
    )
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  if (!request) return { status: "not_found", rateLimited: 0 };

  // A parent is owed an email while their yes is owed and they have not had one.
  const owed = (id: string | null, approvedAt: string | null, notifiedAt: string | null) =>
    id !== null && approvedAt === null && notifiedAt === null ? id : null;
  const joinerParent = owed(request.joiner_parent_id, request.joiner_parent_approved_at, request.joiner_parent_notified_at);
  const dmParent = owed(request.dm_parent_id, request.dm_parent_approved_at, request.dm_parent_notified_at);
  const approvers: Approver[] = [];
  if (joinerParent !== null && joinerParent === dmParent) {
    approvers.push({ id: joinerParent, role: "both", columns: ["joiner_parent_notified_at", "dm_parent_notified_at"] });
  } else {
    if (joinerParent !== null) approvers.push({ id: joinerParent, role: "joiner", columns: ["joiner_parent_notified_at"] });
    if (dmParent !== null) approvers.push({ id: dmParent, role: "dm", columns: ["dm_parent_notified_at"] });
  }
  if (approvers.length === 0) return { status: "already", rateLimited: 0 };

  const apiKey = resendApiKey();
  if (!apiKey) return { status: "not_configured", rateLimited: 0 };

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
    // Claim before sending: only the call that flips this parent's column from
    // null mails them, so two concurrent calls cannot both send.
    const stamp = new Date().toISOString();
    let claim = admin.from("campaign_join_requests").update(
      Object.fromEntries(approver.columns.map((c) => [c, stamp])),
    ).eq("id", requestId);
    for (const c of approver.columns) claim = claim.is(c, null);
    const { data: claimed, error: claimError } = await claim.select("id");
    if (claimError) throw claimError;
    if (!claimed || claimed.length === 0) continue;

    const { data, error: userError } = await admin.auth.admin.getUserById(approver.id);
    const to = data?.user?.email;
    attempted += 1;
    const ok = !userError && !!to &&
      (await sendEmail(apiKey, { to, content: joinRequestEmail({ role: approver.role, familyUrl }) }));
    if (ok) {
      sent += 1;
      continue;
    }
    if (userError || !to) console.error("notifyJoinRequest: approver has no email", userError);
    // Not reached, so let a later call try this parent again.
    const { error: clearError } = await admin
      .from("campaign_join_requests")
      .update(Object.fromEntries(approver.columns.map((c) => [c, null])))
      .eq("id", requestId);
    if (clearError) console.error("notifyJoinRequest: could not clear the notified mark", clearError);
  }

  if (sent > 0) return { status: "sent", rateLimited };
  if (attempted === 0) return { status: rateLimited > 0 ? "nothing_to_send" : "already", rateLimited };
  return { status: "failed", rateLimited };
}
