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
 * function's job is only to validate the parent's address, resolve an
 * optional campaign invite to a name, rate-limit by address, and record
 * enough to let child-account's `create` action finish the job once the
 * parent clicks through.
 */
import { serve } from "std/http/server.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { isoDate } from "../_shared/childAccount.ts";
import { resendApiKey, sendEmail } from "../_shared/resend.ts";
import { parentConsentRequestEmail } from "./email.ts";
import { asString, isValidParentEmail } from "./validation.ts";

const admin: SupabaseClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Three or more requests for this address in the trailing 24h: stop silently — see the file's rate-limit comment below for why silently. */
async function isRateLimited(admin: SupabaseClient, parentEmail: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await admin
    .from("parental_consent_requests")
    .select("id", { count: "exact", head: true })
    .eq("parent_email", parentEmail)
    .gte("created_at", since);
  if (error) throw error;
  if (count === null) {
    // A `head: true, count: "exact"` query always returns a count when there
    // is no error; treat the otherwise-impossible null as "over the limit"
    // (fail closed) rather than silently opening the gate on a shape we
    // didn't expect.
    return true;
  }
  return count >= 3;
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

interface ValidInvite {
  campaignId: string;
  campaignName: string | null;
}

/** A campaign_invites row the token names, only if it's still unexpired and under its use cap. Anything else is silently ignored — see the body spec. */
async function resolveInvite(admin: SupabaseClient, inviteToken: string): Promise<ValidInvite | null> {
  const { data: invite, error } = await admin
    .from("campaign_invites")
    .select("campaign_id, expires_at, max_uses, use_count")
    .eq("token", inviteToken)
    .maybeSingle();
  if (error) throw error;
  if (!invite) return null;

  const unexpired = invite.expires_at === null || new Date(invite.expires_at as string).getTime() > Date.now();
  const underCap = invite.max_uses === null || (invite.use_count as number) < (invite.max_uses as number);
  if (!unexpired || !underCap) return null;

  const { data: campaign } = await admin
    .from("campaigns")
    .select("name")
    .eq("id", invite.campaign_id as string)
    .maybeSingle();
  return { campaignId: invite.campaign_id as string, campaignName: (campaign?.name as string | undefined) ?? null };
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

  // Present only for the existing-account path — see the file header.
  let callerId: string | null = null;
  let callerEmail: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await callerClient.auth.getUser();
    if (user) {
      callerId = user.id;
      callerEmail = asString(user.email);
    }
  }

  if (callerId) {
    if (await isActiveChildAccount(admin, callerId)) return json({ error: "already_child" }, 409);
    if (callerEmail && callerEmail.trim().toLowerCase() === parentEmail) {
      return json({ error: "same_as_account_email" }, 422);
    }
  }

  const inviteToken = asString(body.inviteToken);
  const invite = inviteToken ? await resolveInvite(admin, inviteToken) : null;

  // Never reveal whether this address has been asked before — a prober
  // sending a fourth request in a day gets the identical response a first
  // request would get, so the rate limit itself carries no signal.
  if (await isRateLimited(admin, parentEmail)) {
    return json({ sent: true });
  }

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
      campaign_invite_token: invite ? inviteToken : null,
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
    campaignName: invite?.campaignName ?? null,
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
