/**
 * Admin-only, manually triggered Terms of Service notice. See
 * context/features/notifications.md, "Terms of Service notice (admin)".
 *
 * POST { dryRun?: boolean }. A dry run only counts. A real run mails at most
 * MAX_PER_RUN recipients, sequentially, recording a `terms_notices` row after
 * each attempt (sent_at, or failed_at so failures are retried last); a crash
 * never double-mails. Run it again for the rest. Counts in the answer are
 * those after the run.
 * Never returns or logs an email address.
 */
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/requireAdmin.ts";
import { recordAdminAction } from "../_shared/adminAudit.ts";
import { TERMS_CHANGES, TERMS_VERSION } from "../_shared/consent.ts";
import { resendApiKey, sendEmail } from "../_shared/resend.ts";
import { selectTermsNoticeRecipients, termsNoticeEmail } from "../_shared/termsNotice.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const MAX_PER_RUN = 50;
const USERS_PAGE = 1000;

interface AuthUserRow {
  id: string;
  email: string | null;
  banned_until: string | null;
}

async function listAllUsers(): Promise<AuthUserRow[]> {
  const users: AuthUserRow[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: USERS_PAGE });
    if (error) throw error;
    for (const u of data.users) {
      users.push({
        id: u.id,
        email: u.email ?? null,
        banned_until: u.banned_until ?? null,
      });
    }
    if (data.users.length < USERS_PAGE) return users;
  }
}

/** PostgREST caps one response at max_rows (1000), so read a table page by page. */
async function readAllPages<R>(
  page: (from: number, to: number) => PromiseLike<{ data: R[] | null; error: { message: string } | null }>,
): Promise<R[]> {
  const rows: R[] = [];
  for (let from = 0; ; from += USERS_PAGE) {
    const { data, error } = await page(from, from + USERS_PAGE - 1);
    if (error) throw error;
    if (!data) throw new Error("send-terms-notice: page read returned no data");
    rows.push(...data);
    if (data.length < USERS_PAGE) return rows;
  }
}

async function acceptedVersions(): Promise<Map<string, string | null>> {
  const rows = await readAllPages<{ user_id: string; terms_version: string | null }>((from, to) =>
    admin.from("user_subscriptions").select("user_id, terms_version").order("user_id").range(from, to),
  );
  return new Map(rows.map((r) => [r.user_id, r.terms_version]));
}

/** "Notified" means a row with sent_at; a row with only failed_at is a failed attempt. */
async function notifiedUserIds(version: string): Promise<Set<string>> {
  const rows = await readAllPages<{ user_id: string }>((from, to) =>
    admin
      .from("terms_notices")
      .select("user_id")
      .eq("terms_version", version)
      .not("sent_at", "is", null)
      .order("user_id")
      .range(from, to),
  );
  return new Set(rows.map((r) => r.user_id));
}

async function failedAtByUser(version: string): Promise<Map<string, string>> {
  const rows = await readAllPages<{ user_id: string; failed_at: string }>((from, to) =>
    admin
      .from("terms_notices")
      .select("user_id, failed_at")
      .eq("terms_version", version)
      .is("sent_at", null)
      .not("failed_at", "is", null)
      .order("user_id")
      .range(from, to),
  );
  return new Map(rows.map((r) => [r.user_id, r.failed_at]));
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

  let selection;
  try {
    const [users, accepted, notified, failedAt] = await Promise.all([
      listAllUsers(),
      acceptedVersions(),
      notifiedUserIds(TERMS_VERSION),
      failedAtByUser(TERMS_VERSION),
    ]);
    selection = selectTermsNoticeRecipients(users, accepted, notified, failedAt, TERMS_VERSION);
  } catch (err) {
    console.error("send-terms-notice: recipient lookup failed:", err instanceof Error ? err.message : err);
    return json({ error: "lookup_failed" }, 500);
  }

  const pendingBefore = selection.recipients.length;
  let sent = 0;
  let failed = 0;

  if (!dryRun && apiKey) {
    const mail = termsNoticeEmail({ version: TERMS_VERSION, changes: TERMS_CHANGES });
    for (const recipient of selection.recipients.slice(0, MAX_PER_RUN)) {
      const ok = await sendEmail(apiKey, { to: recipient.email, content: mail });
      const now = new Date().toISOString();
      // Record straight after the send: a crash past this point never re-mails.
      // A failure is recorded too, so the next run tries this address last.
      const { error } = await admin
        .from("terms_notices")
        .upsert(
          ok
            ? { user_id: recipient.id, terms_version: TERMS_VERSION, sent_at: now }
            : { user_id: recipient.id, terms_version: TERMS_VERSION, failed_at: now },
          { onConflict: "user_id,terms_version" },
        );
      if (error) {
        console.error("send-terms-notice: terms_notices upsert failed:", error.message);
        return json({ error: "record_failed", sent, failed }, 500);
      }
      if (!ok) {
        failed++;
        continue;
      }
      sent++;
    }

    if (sent > 0) {
      await recordAdminAction(admin, {
        adminUserId: caller.id,
        action: "terms_notice_sent",
        details: { terms_version: TERMS_VERSION, sent, failed },
      });
    }
  }

  return json({
    configured: apiKey !== null,
    version: TERMS_VERSION,
    changes: TERMS_CHANGES,
    // Counts as they stand after this run, so a client can cache them as the status.
    pending: pendingBefore - sent,
    alreadyAccepted: selection.alreadyAccepted,
    alreadyNotified: selection.alreadyNotified + sent,
    previouslyFailed: selection.previouslyFailed,
    sent,
    failed,
    batchSize: MAX_PER_RUN,
  });
}));
