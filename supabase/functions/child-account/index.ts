/**
 * Parent-managed accounts for players under 16 (#919): create or convert a
 * child account, let a parent preview a consent request before acting on it,
 * and let a parent reset their child's password. Schema and the reasoning
 * behind it: supabase/migrations/20260928053257_child_accounts.sql. Shared
 * rules (login-name shape, the reserved email domain, the age math): the pure
 * _shared/childAccount.ts, which both this function and the client import.
 *
 * verify_jwt stays on (the default — no config.toml entry needed) because
 * every action here is something only a signed-in parent may do. The first
 * thing the handler does after resolving the caller is refuse them outright
 * if THEY are a child account: a child could otherwise mint another child
 * account, or use `reset-password` on a sibling, which would make "a parent
 * consented" stop meaning what it says everywhere else in the schema.
 *
 * `create` either converts an EXISTING account — one the child made
 * themselves before the Terms gate found they were under 16 — or mints a
 * brand new one. Conversion only changes the account's email to the reserved
 * child-login address and records the parent link; everything the child
 * already made stays theirs. A freshly created auth user that fails to get
 * its child_accounts row is deleted again rather than left behind: an
 * unlinked auth user with a `.invalid` login email is a login nobody can ever
 * use (the sign-in form derives the address FROM a login name that has no
 * row to look up), so leaving it would be a silent, permanent orphan rather
 * than a state the parent can retry out of.
 *
 * A `requestToken` names a `parental_consent_requests` row a child created by
 * asking. The row records the parent's email but not their identity, so the
 * one check that stands between that token and someone else's account is
 * that the caller's OWN confirmed email must equal the row's parent_email.
 * The token alone is deliberately not enough to claim a child: it travels in
 * an email to whatever address the child typed, and a forwarded message or a
 * shared inbox must not hand the child to whoever opens it first.
 *
 * Converting an existing account writes the parent link BEFORE it rewrites
 * the account's login, so a failure part-way leaves the account exactly as it
 * was (the link is removed again) rather than signed out of its old email with
 * no parent to reset it. Some accounts are refused outright: an app admin, an
 * account that is itself a parent, and one with a live paid subscription,
 * which would go on being charged for Pro a child account can never use.
 */
import { serve } from "std/http/server.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { notifyJoinRequest } from "../_shared/joinRequestNotify.ts";
import {
  adultOn,
  childLoginEmail,
  isChildLoginEmail,
  isUnderAdultAge,
  isValidBirthMonth,
  isValidLoginName,
  isoDate,
  normalizeLoginName,
  PARENTAL_CONSENT_VERSION,
  type BirthMonth,
} from "../_shared/childAccount.ts";
import { TERMS_VERSION } from "../_shared/consent.ts";
import {
  asString,
  isDuplicateEmailError,
  isLoginNameUniqueViolation,
  isValidDisplayName,
  isValidPassword,
  parseBirth,
} from "./validation.ts";

const admin: SupabaseClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

interface ConsentRequestRow {
  id: string;
  token: string;
  parent_email: string;
  campaign_invite_token: string | null;
  child_user_id: string | null;
  expires_at: string;
}

/** The row for an unexpired request token, or null if it doesn't exist or has expired. */
async function loadRequest(requestToken: string): Promise<ConsentRequestRow | null> {
  const { data, error } = await admin
    .from("parental_consent_requests")
    .select("id, token, parent_email, campaign_invite_token, child_user_id, expires_at")
    .eq("token", requestToken)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as ConsentRequestRow;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

async function isActiveChildAccount(userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("child_accounts")
    .select("child_user_id")
    .eq("child_user_id", userId)
    .gt("adult_on", isoDate(new Date()))
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** Whether `parentUserId` is the ACTIVE parent of `childUserId` — the reset-password gate. */
async function isActiveParentOf(childUserId: string, parentUserId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("child_accounts")
    .select("child_user_id")
    .eq("child_user_id", childUserId)
    .eq("parent_user_id", parentUserId)
    .gt("adult_on", isoDate(new Date()))
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/**
 * Whether an existing account may become a child account: not an app admin,
 * not itself a parent, and not paying for a subscription (see the header).
 */
async function isConvertible(userId: string): Promise<boolean> {
  const [{ data: user, error: userError }, { count: children, error: childrenError }, { data: sub, error: subError }] =
    await Promise.all([
      admin.auth.admin.getUserById(userId),
      admin.from("child_accounts").select("child_user_id", { count: "exact", head: true }).eq("parent_user_id", userId),
      admin.from("user_subscriptions").select("stripe_subscription_id, status").eq("user_id", userId).maybeSingle(),
    ]);
  if (userError || childrenError || subError || !user?.user || children === null) {
    throw userError ?? childrenError ?? subError ?? new Error("isConvertible: account not found");
  }
  if (user.user.app_metadata?.role === "admin") return false;
  if (children > 0) return false;
  const paying = sub !== null && sub.stripe_subscription_id !== null && ["active", "trialing", "past_due"].includes(sub.status as string);
  return !paying;
}

async function campaignNameOf(campaignId: string): Promise<string | null> {
  const { data } = await admin.from("campaigns").select("name").eq("id", campaignId).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

/**
 * Best-effort, non-fatal: an invite can be revoked between the child's ask and
 * the parent's approval. A join involving another family's child or campaign
 * comes back `pending`, and that family's parent is emailed here, since the
 * child has no session to ring notify-join-request from.
 */
async function joinCampaignForChild(
  campaignInviteToken: string,
  childUserId: string,
  parentUserId: string,
): Promise<JoinedCampaign | null> {
  const { data, error } = await admin.rpc("join_campaign_for_child", {
    p_token: campaignInviteToken,
    p_child_user_id: childUserId,
    p_parent_user_id: parentUserId,
  });
  if (error) {
    console.error("child-account: join_campaign_for_child failed (non-fatal)", error);
    return null;
  }
  const outcome = data as { status?: unknown; campaign_id?: unknown; request_id?: unknown } | null;
  if (!outcome || typeof outcome.campaign_id !== "string") return null;
  if (outcome.status !== "joined" && outcome.status !== "pending") return null;
  if (outcome.status === "pending" && typeof outcome.request_id === "string") {
    try {
      await notifyJoinRequest(admin, outcome.request_id);
    } catch (notifyError) {
      console.error("child-account: notifying the approving parent failed (non-fatal)", notifyError);
    }
  }
  const name = await campaignNameOf(outcome.campaign_id);
  return { id: outcome.campaign_id, name: name ?? "Your campaign", status: outcome.status };
}

async function deleteRequest(id: string): Promise<void> {
  const { error } = await admin.from("parental_consent_requests").delete().eq("id", id);
  if (error) console.error("child-account: failed to delete a used consent request", error);
}

interface JoinedCampaign {
  id: string;
  name: string;
  /** `pending` while a parent of the other side has yet to approve. */
  status: "joined" | "pending";
}

interface CreateResult {
  childUserId: string;
  loginName: string;
  joinedCampaign: JoinedCampaign | null;
}

/**
 * Why the caller may not act as a parent, or null when they may. Grimoire
 * keeps no adult flag, so two things the account told us stand in for one:
 * an open request asking its own parent means it said it is under 16, and
 * acceptance of the current Terms means it answered the age question as 16 or
 * older, at signup or at the Terms gate. "Not an active child" alone is not
 * enough: an under-16 still waiting for its parent is not one yet.
 */
async function parentRefusal(callerId: string): Promise<Response | null> {
  const [{ count: openRequests, error: requestError }, { data: sub, error: subError }] = await Promise.all([
    admin
      .from("parental_consent_requests")
      .select("id", { count: "exact", head: true })
      .eq("child_user_id", callerId)
      .gt("expires_at", new Date().toISOString()),
    admin.from("user_subscriptions").select("terms_version").eq("user_id", callerId).maybeSingle(),
  ]);
  if (requestError || subError || openRequests === null) {
    console.error("child-account: parent check failed", requestError ?? subError);
    return json({ error: "account_check_failed" }, 503);
  }
  if (openRequests > 0) return json({ error: "awaiting_parent" }, 403);
  if ((sub as { terms_version: string | null } | null)?.terms_version !== TERMS_VERSION) {
    return json({ error: "terms_not_accepted" }, 403);
  }
  return null;
}

async function handleCreate(body: Record<string, unknown>, callerId: string, callerEmail: string | null): Promise<Response> {
  const refusal = await parentRefusal(callerId);
  if (refusal) return refusal;

  const consentVersion = asString(body.consentVersion);
  if (consentVersion !== PARENTAL_CONSENT_VERSION) {
    return json({ error: "stale_consent" }, 409);
  }

  const today = new Date();
  const birth = parseBirth(body.birth);
  if (!birth || !isValidBirthMonth(birth, today)) {
    return json({ error: "invalid_birth" }, 422);
  }
  if (!isUnderAdultAge(birth, today)) {
    // 16+ signs up for themselves — this endpoint is for younger players only.
    return json({ error: "not_a_child" }, 422);
  }

  const loginNameInput = asString(body.loginName);
  if (loginNameInput === null || !isValidLoginName(loginNameInput)) {
    return json({ error: "invalid_login_name" }, 422);
  }
  const loginName = normalizeLoginName(loginNameInput);

  const password = asString(body.password);
  if (password === null || !isValidPassword(password)) {
    return json({ error: "weak_password" }, 422);
  }

  const displayNameInput = asString(body.displayName);
  const displayName = displayNameInput === null ? null : displayNameInput.trim();
  if (displayName === null || !isValidDisplayName(displayName)) {
    return json({ error: "invalid_display_name" }, 422);
  }

  const requestToken = asString(body.requestToken);
  let consentRequest: ConsentRequestRow | null = null;
  if (requestToken) {
    consentRequest = await loadRequest(requestToken);
    if (!consentRequest) return json({ error: "request_not_found" }, 404);
    // The token alone is not the credential — see the file header: the
    // caller's OWN verified email must be the one the request was sent to.
    if (!callerEmail || callerEmail.toLowerCase() !== consentRequest.parent_email.trim().toLowerCase()) {
      return json({ error: "wrong_parent" }, 403);
    }
  }

  const result = consentRequest?.child_user_id
    ? await convertExistingAccount(consentRequest.child_user_id, { loginName, password, displayName, callerId, consentVersion, birth })
    : await createNewAccount({ loginName, password, displayName, callerId, consentVersion, birth });
  if (result instanceof Response) return result;

  let joinedCampaign: JoinedCampaign | null = null;
  if (consentRequest?.campaign_invite_token) {
    joinedCampaign = await joinCampaignForChild(consentRequest.campaign_invite_token, result.childUserId, callerId);
  }
  if (consentRequest) await deleteRequest(consentRequest.id);

  const response: CreateResult = { childUserId: result.childUserId, loginName: result.loginName, joinedCampaign };
  return json({ ...response });
}

interface AccountFields {
  loginName: string;
  password: string;
  displayName: string;
  callerId: string;
  consentVersion: string;
  birth: BirthMonth;
}

async function convertExistingAccount(
  childUserId: string,
  fields: AccountFields,
): Promise<{ childUserId: string; loginName: string } | Response> {
  if (await isActiveChildAccount(childUserId)) {
    return json({ error: "already_child" }, 409);
  }
  if (!(await isConvertible(childUserId))) {
    return json({ error: "cannot_convert" }, 409);
  }

  // Link first, login second: see the header.
  const { error: insertError } = await admin.from("child_accounts").insert({
    child_user_id: childUserId,
    parent_user_id: fields.callerId,
    login_name: fields.loginName,
    adult_on: adultOn(fields.birth),
    consent_version: fields.consentVersion,
  });
  if (insertError) {
    if (isLoginNameUniqueViolation(insertError)) return json({ error: "login_name_taken" }, 409);
    console.error("child-account: child_accounts insert failed converting an account", insertError);
    return json({ error: "create_failed" }, 500);
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(childUserId, {
    email: childLoginEmail(fields.loginName),
    email_confirm: true,
    password: fields.password,
    user_metadata: { display_name: fields.displayName },
  });
  if (updateError) {
    const { error: unlinkError } = await admin.from("child_accounts").delete().eq("child_user_id", childUserId);
    if (unlinkError) {
      console.error("child-account: could not remove the link after a failed conversion", childUserId, unlinkError);
    }
    if (isDuplicateEmailError(updateError)) return json({ error: "login_name_taken" }, 409);
    console.error("child-account: updateUserById failed converting an existing account", updateError);
    return json({ error: "create_failed" }, 500);
  }

  return { childUserId, loginName: fields.loginName };
}

async function createNewAccount(
  fields: AccountFields,
): Promise<{ childUserId: string; loginName: string } | Response> {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: childLoginEmail(fields.loginName),
    password: fields.password,
    email_confirm: true,
    user_metadata: { display_name: fields.displayName },
  });
  if (createError || !created?.user) {
    if (isDuplicateEmailError(createError)) return json({ error: "login_name_taken" }, 409);
    console.error("child-account: createUser failed", createError);
    return json({ error: "create_failed" }, 500);
  }
  const childUserId = created.user.id;

  const { error: insertError } = await admin.from("child_accounts").insert({
    child_user_id: childUserId,
    parent_user_id: fields.callerId,
    login_name: fields.loginName,
    adult_on: adultOn(fields.birth),
    consent_version: fields.consentVersion,
  });
  if (insertError) {
    // No orphan accounts — see the file header.
    const { error: rollbackError } = await admin.auth.admin.deleteUser(childUserId);
    if (rollbackError) {
      console.error("child-account: rollback deleteUser also failed — orphan auth user", childUserId, rollbackError);
    }
    if (isLoginNameUniqueViolation(insertError)) return json({ error: "login_name_taken" }, 409);
    console.error("child-account: child_accounts insert failed, auth user rolled back", insertError);
    return json({ error: "create_failed" }, 500);
  }

  return { childUserId, loginName: fields.loginName };
}

async function handleInspectRequest(body: Record<string, unknown>, callerEmail: string | null): Promise<Response> {
  const requestToken = asString(body.requestToken);
  const consentRequest = requestToken ? await loadRequest(requestToken) : null;
  if (!consentRequest) return json({ error: "request_not_found" }, 404);
  if (!callerEmail || callerEmail.toLowerCase() !== consentRequest.parent_email.trim().toLowerCase()) {
    return json({ error: "wrong_parent" }, 403);
  }

  let campaignName: string | null = null;
  if (consentRequest.campaign_invite_token) {
    const { data: invite } = await admin
      .from("campaign_invites")
      .select("campaign_id")
      .eq("token", consentRequest.campaign_invite_token)
      .maybeSingle();
    if (invite?.campaign_id) campaignName = await campaignNameOf(invite.campaign_id as string);
  }

  return json({
    existingAccount: consentRequest.child_user_id !== null,
    campaignName,
    expiresAt: consentRequest.expires_at,
  });
}

async function handleResetPassword(body: Record<string, unknown>, callerId: string): Promise<Response> {
  const childUserId = asString(body.childUserId);
  if (!childUserId || !(await isActiveParentOf(childUserId, callerId))) {
    return json({ error: "not_your_child" }, 403);
  }
  const password = asString(body.password);
  if (password === null || !isValidPassword(password)) return json({ error: "weak_password" }, 422);

  const { error } = await admin.auth.admin.updateUserById(childUserId, { password });
  if (error) {
    console.error("child-account: reset-password updateUserById failed", error);
    return json({ error: "reset_failed" }, 500);
  }
  return json({ ok: true });
}

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);
  const callerClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
  if (callerError || !caller) return json({ error: "Unauthorized" }, 401);

  // A child account may never reach any action here — see the file header.
  const callerEmail = asString(caller.email);
  // Only a confirmed address proves the caller is the parent a request was
  // sent to (see the header); an unconfirmed one matches no request.
  const confirmedEmail = caller.email_confirmed_at ? callerEmail : null;
  const callerEmailIsChildDomain = callerEmail !== null && isChildLoginEmail(callerEmail);
  if (callerEmailIsChildDomain || (await isActiveChildAccount(caller.id))) {
    return json({ error: "child_account" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (typeof parsed !== "object" || parsed === null) throw new Error("body must be an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  switch (body.action) {
    case "create":
      return handleCreate(body, caller.id, confirmedEmail);
    case "inspect-request":
      return handleInspectRequest(body, confirmedEmail);
    case "reset-password":
      return handleResetPassword(body, caller.id);
    default:
      return json({ error: "unknown_action" }, 400);
  }
}));
