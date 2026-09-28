/**
 * A young player asks a parent to set up, or approve, a Grimoire account
 * (#919). Two callers reach this:
 *
 *  - The signup page, before any account exists — no Authorization header,
 *    because there is nothing to send one from. `verify_jwt` is off for
 *    exactly this reason (see config.toml).
 *  - An existing account the Terms gate found to be under 16, asking their
 *    parent to approve turning it into a managed child account. This caller
 *    DOES send a bearer token, which is read and verified manually (the
 *    gateway check being off doesn't mean the token is trusted unchecked).
 *
 * Every word of the email is fixed — see email.ts's header for why. This
 * function's job is only to validate the parent's address, check an
 * optional campaign invite is still valid, rate-limit (see RATE_LIMITS), and
 * record enough to let child-account's `create` action finish the job once
 * the parent clicks through.
 */
import { serve } from "std/http/server.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { isoDate } from "../_shared/childAccount.ts";
import { resendApiKey, sendEmail } from "../_shared/resend.ts";
import { parentConsentRequestEmail } from "./email.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { addressRateLimitKey, asString, bearerSubject, isValidParentEmail } from "./validation.ts";

/**
 * The key for the app-wide anonymous bucket in `rate_limit_events`. Not an
 * account: that log has no foreign key, and this uuid can never be a user's,
 * so export and erasure (which key on real ids) never see it.
 */
const ANONYMOUS_BUCKET = "00000000-0000-4919-8000-000000000000";

const admin: SupabaseClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function isActiveChildAccount(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("child_accounts")
    .select("child_user_id")
    .eq("child_user_id", userId)
    .gt("adult_on", isoDate(new Date()))
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** Whether the token names a campaign invite that is still unexpired and under its use cap. Anything else is silently ignored. */
async function isValidInvite(admin: SupabaseClient, inviteToken: string): Promise<boolean> {
  const { data: invite, error } = await admin
    .from("campaign_invites")
    .select("expires_at, max_uses, use_count")
    .eq("token", inviteToken)
    .maybeSingle();
  if (error) throw error;
  if (!invite) return false;
  const unexpired = invite.expires_at === null || new Date(invite.expires_at as string).getTime() > Date.now();
  const underCap = invite.max_uses === null || (invite.use_count as number) < (invite.max_uses as number);
  return unexpired && underCap;
}

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (typeof parsed !== "object" || parsed === null) throw new Error("body must be an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const parentEmailInput = asString(body.parentEmail);
  if (parentEmailInput === null) return json({ error: "invalid_email" }, 422);
  const parentEmail = parentEmailInput.trim().toLowerCase();
  if (!isValidParentEmail(parentEmail)) return json({ error: "invalid_email" }, 422);

  // Present only for the existing-account path — see the file header. A
  // token that claims a user must verify; it never falls back to the
  // anonymous path (see bearerSubject for why that would strand the child).
  let callerId: string | null = null;
  let callerEmail: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (bearerSubject(authHeader) !== null) {
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader as string } } },
    );
    const { data: { user }, error: userError } = await callerClient.auth.getUser();
    if (userError || !user) return json({ error: "unauthorized" }, 401);
    callerId = user.id;
    callerEmail = asString(user.email);
  }

  if (callerId) {
    if (await isActiveChildAccount(admin, callerId)) return json({ error: "already_child" }, 409);
    if (callerEmail && callerEmail.trim().toLowerCase() === parentEmail) {
      return json({ error: "same_as_account_email" }, 422);
    }
  }

  const inviteToken = asString(body.inviteToken);
  const invite = inviteToken !== null && (await isValidInvite(admin, inviteToken)) ? inviteToken : null;

  // Every limit is checked before any row is touched, in the append-only
  // rate_limit_events log. Counting this function's own rows was bypassable:
  // the signed-in path replaces the caller's previous request, so the count
  // never grew. A limited request gets the same answer a sent one does, so
  // the limit carries no signal about an address.
  const allowed =
    (callerId === null || (await checkRateLimit(admin, callerId, "parental_consent_caller"))) &&
    (await checkRateLimit(admin, await addressRateLimitKey(parentEmail), "parental_consent_address")) &&
    (callerId !== null || (await checkRateLimit(admin, ANONYMOUS_BUCKET, "parental_consent_anonymous")));
  if (!allowed) return json({ sent: true });

  // One open request per account: replace rather than accumulate, matching
  // the unique index on child_user_id.
  if (callerId) {
    const { error: deleteError } = await admin
      .from("parental_consent_requests")
      .delete()
      .eq("child_user_id", callerId);
    if (deleteError) throw deleteError;
  }

  const { data: inserted, error: insertError } = await admin
    .from("parental_consent_requests")
    .insert({
      parent_email: parentEmail,
      campaign_invite_token: invite,
      child_user_id: callerId,
    })
    .select("token")
    .single();
  if (insertError) throw insertError;
  const token = inserted.token as string;

  const apiKey = resendApiKey();
  if (!apiKey) return json({ configured: false });

  const appOrigin = (Deno.env.get("APP_URL") ?? "https://app.dungeongrimoire.com").replace(/\/+$/, "");
  const content = parentConsentRequestEmail({
    fromInvite: invite !== null,
    addUrl: `${appOrigin}/account/family/add?request=${token}`,
  });

  const sent = await sendEmail(apiKey, { to: parentEmail, content });
  if (!sent) {
    // The request without its email is worse than no request: the parent can
    // never learn the token, and the child's "I asked" state would lie.
    const { error: rollbackError } = await admin.from("parental_consent_requests").delete().eq("token", token);
    if (rollbackError) console.error("request-parental-consent: rollback delete failed after send failure", rollbackError);
    return json({ error: "send_failed" }, 502);
  }

  return json({ sent: true });
}));
