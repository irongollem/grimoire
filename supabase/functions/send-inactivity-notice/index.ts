/**
 * Admin-only, manually triggered inactivity notice. See
 * context/features/notifications.md, "Inactivity notice (admin)".
 *
 * POST { dryRun?: boolean }. A dry run only counts. A real run mails at most
 * MAX_PER_RUN recipients, sequentially, recording the attempt straight after
 * each one (`record_inactivity_notice`: sent_at, or failed_at so failures are
 * retried last); a crash never double-mails. Run it again for the rest. Counts
 * in the answer are those after the run.
 * Never returns or logs an email address.
 */
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";
import { recordAdminAction } from "../_shared/adminAudit.ts";
import { isChildLoginEmail } from "../_shared/childAccount.ts";
import { NOTICE_GRACE_DAYS, inactivityNoticeEmail } from "../_shared/inactivityNotice.ts";
import { resendApiKey, sendEmail } from "../_shared/resend.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const MAX_PER_RUN = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

interface NoticeRecipient {
  user_id: string;
  email: string | null;
  is_child: boolean;
  last_active_at: string;
  failed_at: string | null;
}

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  const gate = await requireAdmin(req);
  if (gate instanceof Response) return gate;
  const caller = gate;

  let dryRun = false;
  try {
    const text = await req.text();
    if (text.trim()) {
      const body: unknown = JSON.parse(text);
      if (typeof body === "object" && body !== null && "dryRun" in body) {
        dryRun = body.dryRun === true;
      }
    }
  } catch {
    return json({ error: "Invalid body, need { dryRun?: boolean }" }, 400);
  }

  const apiKey = resendApiKey();

  // The RPC already orders never-tried first and earlier failures last.
  const { data, error: lookupError } = await admin.rpc("inactivity_notice_recipients");
  if (lookupError) {
    console.error("send-inactivity-notice: recipient lookup failed:", lookupError.message);
    return json({ error: "lookup_failed" }, 500);
  }
  const rows = (data ?? []) as NoticeRecipient[];
  // A child with no parent address carries the child's reserved login address,
  // which is never mailed and not counted as pending.
  const recipients = rows.filter((r) => r.email && !isChildLoginEmail(r.email));
  const pendingBefore = recipients.length;
  const previouslyFailed = recipients.filter((r) => r.failed_at !== null).length;
  let sent = 0;
  let failed = 0;

  if (!dryRun && apiKey) {
    const deleteAfter = new Date(Date.now() + NOTICE_GRACE_DAYS * DAY_MS).toISOString();
    for (const recipient of recipients.slice(0, MAX_PER_RUN)) {
      const mail = inactivityNoticeEmail({
        lastActiveAt: recipient.last_active_at,
        deleteAfter,
        forParent: recipient.is_child,
      });
      const ok = await sendEmail(apiKey, { to: recipient.email!, content: mail });
      // Record straight after the send: a crash past this point never re-mails.
      // A failure is recorded too, so the next run tries this address last.
      const { error } = await admin.rpc("record_inactivity_notice", {
        p_user_id: recipient.user_id,
        p_sent: ok,
      });
      if (error) {
        console.error("send-inactivity-notice: record failed:", error.message);
        return json({ error: "record_failed", sent, failed }, 500);
      }
      if (ok) sent++;
      else failed++;
    }

    if (sent > 0) {
      await recordAdminAction(admin, {
        adminUserId: caller.id,
        action: "inactivity_notice_sent",
        details: { sent, failed },
      });
    }
  }

  return json({
    configured: apiKey !== null,
    // Counts as they stand after this run, so a client can cache them as the status.
    pending: pendingBefore - sent,
    previouslyFailed,
    sent,
    failed,
    batchSize: MAX_PER_RUN,
  });
}));
