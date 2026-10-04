/**
 * Player email: "a new session date was proposed", and nothing else.
 *
 * Email is for planning between sessions, never for play. Notes and handouts
 * are shared mostly during a session, with everyone at the table, and reach the
 * player in the app (journal unread dots, campaign announcements). The note and
 * handout emails were removed on 4 Oct 2026 for that reason; do not add one for
 * anything that happens at the table.
 *
 * Invoked fire-and-forget from the app right after the DM proposes a date
 * (SchedulingTab), NOT from a DB trigger: campaign backup restore inserts
 * straight into `session_proposals`, and a trigger would re-email every player
 * about years-old proposals on every restore.
 *
 * Trust boundary: the client only names WHICH proposal was created.
 * Recipients are re-derived here from DB state (campaign_members →
 * auth.users.email) with the caller verified as a DM of that campaign: player
 * emails never reach the browser.
 *
 * Provider: Resend. Until the RESEND_API_KEY function secret is set this
 * no-ops with { configured: false } — safe to deploy before the account
 * exists (the poll-meshy-jobs 503 precedent). Optional NOTIFY_FROM_EMAIL
 * overrides the sender ("Name <addr>" form).
 *
 * A proposal email is composed PER RECIPIENT rather than once for the party,
 * because each carries that player's own RSVP token: two one-click links, and
 * — when RSVP_INBOUND_DOMAIN is configured — a METHOD:REQUEST invitation their
 * mail app turns into Accept / Decline. See session-rsvp, session-rsvp-inbound
 * and _shared/ics.ts. Without that domain the invitation is deliberately
 * omitted: an invitation whose replies reach nobody is worse than none, because
 * the player believes they have answered.
 */
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { buildSessionInvite, type IcsSessionEvent } from "../_shared/ics.ts";
import { isoDate } from "../_shared/childAccount.ts";
import { resendApiKey, sendEmail, type OutgoingEmail } from "../_shared/resend.ts";
import {
  proposalCreatedEmail,
  type RsvpLinks,
} from "./emails.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface MemberRow {
  user_id: string;
  party_member_id: string | null;
  display_name: string | null;
  role: "dm" | "player";
}

/** A resolved addressee: the user id is kept so per-player content can key on it. */
interface Recipient {
  userId: string;
  email: string;
  displayName: string | null;
}

// Local alias kept so the rest of this file (written before the extraction)
// doesn't have to rename every call site — same shape as _shared/resend.ts.
type OutgoingMail = OutgoingEmail;

async function fetchMembers(campaignId: string): Promise<MemberRow[]> {
  const { data, error } = await admin
    .from("campaign_members")
    .select("user_id, party_member_id, display_name, role")
    .eq("campaign_id", campaignId);
  if (error) throw error;
  return (data ?? []) as MemberRow[];
}

async function campaignName(campaignId: string): Promise<string> {
  const { data } = await admin.from("campaigns").select("name").eq("id", campaignId).maybeSingle();
  return data?.name ?? "Your campaign";
}

/** Drop recipients whose notification_preferences row turns this email off. */
async function filterByPreference(userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];
  const { data, error } = await admin
    .from("notification_preferences")
    .select("user_id, email_session_proposals")
    .in("user_id", userIds);
  if (error) throw error;
  const optedOut = new Set(
    (data ?? [])
      .filter((row) => row.email_session_proposals === false)
      .map((row) => row.user_id as string),
  );
  // No row = defaults = opted in.
  return userIds.filter((id) => !optedOut.has(id));
}

async function resolveRecipients(userIds: string[], members: MemberRow[]): Promise<Recipient[]> {
  const results = await Promise.all(
    userIds.map(async (id) => {
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error) {
        console.error(`send-notification-email: getUserById(${id}) failed`, error);
        return null;
      }
      const email = data.user?.email;
      if (!email) return null;
      return {
        userId: id,
        email,
        displayName: members.find((m) => m.user_id === id)?.display_name ?? null,
      };
    }),
  );
  return results.filter((r): r is Recipient => r !== null);
}

async function sendAll(mails: OutgoingMail[], apiKey: string): Promise<number> {
  let sent = 0;
  for (const mail of mails) {
    if (await sendEmail(apiKey, mail)) sent++;
  }
  return sent;
}

/**
 * Drop recipients who are active child accounts (#919). Their address is on
 * CHILD_LOGIN_DOMAIN, a reserved `.invalid` TLD that can never receive mail —
 * so this filter isn't strictly load-bearing against a bounce — but it is
 * made explicit anyway: relying on an unreachable domain as the only thing
 * standing between a child and an email is a property nobody asked for, and
 * it also means the RSVP-token mint below (which fires on the ids that reach
 * it) never wastes a token on an address nothing can answer from.
 */
async function filterOutChildAccounts(userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];
  const { data, error } = await admin
    .from("child_accounts")
    .select("child_user_id")
    .in("child_user_id", userIds)
    .gt("adult_on", isoDate(new Date()));
  if (error) throw error;
  const children = new Set((data ?? []).map((row) => (row as { child_user_id: string }).child_user_id));
  return userIds.filter((id) => !children.has(id));
}

/** UTF-8 → base64, which is how Resend takes an attachment body. */
function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(withCors(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401 });
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return new Response("Unauthorized", { status: 401 });

  let body: {
    type?: string;
    proposal_id?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // Resolve the campaign + recipient user ids per event type. Everything is
  // re-read from the DB — the request body is only a pointer.
  let campaignId: string;
  let members: MemberRow[];
  let recipientIds: string[];
  // Per recipient rather than per campaign: a proposal email carries that one
  // player's RSVP token, so no two are the same message.
  let buildMail: (
    campaign: string,
    dmName: string,
    recipient: Recipient,
  ) => OutgoingMail;
  // Runs once the opt-outs are known, so nothing is minted for someone who
  // will never be mailed. Only the proposal branch has anything to prepare.
  let prepare: (optedIn: string[]) => Promise<void> = async () => {};

  if (body.type === "proposal_created") {
    if (!body.proposal_id) return json({ error: "proposal_created needs { proposal_id }" }, 400);
    const { data: proposal, error } = await admin
      .from("session_proposals")
      .select("id, campaign_id, title, notes, proposed_date, proposed_time, duration_minutes, status")
      .eq("id", body.proposal_id)
      .maybeSingle();
    if (error) throw error;
    if (!proposal) return json({ error: "Proposal not found" }, 404);
    if (proposal.status === "cancelled") return json({ sent: 0, reason: "cancelled" });
    campaignId = proposal.campaign_id as string;

    members = await fetchMembers(campaignId);
    if (!members.some((m) => m.user_id === user.id && m.role === "dm")) {
      return new Response("Forbidden", { status: 403 });
    }

    recipientIds = members
      .filter((m) => m.role === "player" && m.user_id !== user.id)
      .map((m) => m.user_id);

    const proposalId = proposal.id as string;
    const proposalTitle = (proposal.title as string) || "Session";
    const proposedDate = proposal.proposed_date as string;
    const proposedTime = proposal.proposed_time as string | null;

    // Minted before the send loop, so a failure here degrades the whole
    // mailing to link-free rather than half the party getting buttons.
    const tokens = new Map<string, IssuedInvite>();
    prepare = async (optedIn) => { await issueRsvpTokens(proposalId, optedIn, tokens); };

    const inboundDomain = (Deno.env.get("RSVP_INBOUND_DOMAIN") ?? "").trim().toLowerCase();
    // The app's origin, not SUPABASE_URL: the hosted gateway serves an Edge
    // Function's HTML as text/plain, so the page is relayed through the app's
    // own /api/rsvp (see api/_rsvpRelay.ts at the repo root).
    const rsvpEndpoint = `${(Deno.env.get("APP_URL") ?? "https://app.dungeongrimoire.com").replace(/\/+$/, "")}/api/rsvp`;
    const event: IcsSessionEvent = {
      id: proposalId,
      title: proposalTitle,
      notes: (proposal.notes as string | null) ?? null,
      date: proposedDate,
      time: proposedTime,
      durationMinutes: (proposal.duration_minutes as number | null) ?? null,
      status: "proposed",
    };

    buildMail = (campaign, dmName, recipient) => {
      const issued = tokens.get(recipient.userId);
      const rsvp: RsvpLinks | null = issued
        ? {
            yesUrl: `${rsvpEndpoint}?token=${issued.token}&answer=yes`,
            noUrl: `${rsvpEndpoint}?token=${issued.token}&answer=no`,
          }
        : null;
      const organizerEmail = issued && inboundDomain ? `rsvp+${issued.token}@${inboundDomain}` : null;
      return {
        to: recipient.email,
        content: proposalCreatedEmail({
          campaignName: campaign,
          dmName,
          proposalTitle,
          proposedDate,
          proposedTime,
          rsvp,
        }),
        // Reply-To as well as ORGANIZER: a few clients reply to the header
        // rather than the calendar property, and both must reach the same
        // mailbox for the answer to be recorded.
        ...(organizerEmail ? { replyTo: organizerEmail } : {}),
        ...(organizerEmail
          ? {
              attachments: [{
                filename: "session.ics",
                content: toBase64(buildSessionInvite({
                  campaignName: campaign,
                  event,
                  now: new Date(),
                  organizerEmail,
                  organizerName: dmName,
                  attendeeEmail: recipient.email,
                  attendeeName: recipient.displayName,
                  sequence: issued!.sequence,
                  respondUrl: rsvp?.yesUrl ?? null,
                })),
                // The `method=REQUEST` parameter is what makes a mail client
                // render Accept / Decline instead of a file to download.
                content_type: "text/calendar; method=REQUEST; charset=utf-8",
              }],
            }
          : {}),
      };
    };
  } else {
    return json({ error: "Unknown type" }, 400);
  }

  // Never a child account, before anything else touches the id list — see
  // filterOutChildAccounts for why this runs ahead of the RSVP token mint too.
  recipientIds = await filterOutChildAccounts([...new Set(recipientIds)]);
  const optedIn = await filterByPreference(recipientIds);
  if (!optedIn.length) return json({ sent: 0 });

  const apiKey = resendApiKey();
  if (!apiKey) return json({ sent: 0, configured: false });

  if (!(await checkRateLimit(admin, user.id, "email_notify"))) {
    return json({ error: "Rate limit exceeded" }, 429);
  }

  await prepare(optedIn);

  const dmName = members.find((m) => m.user_id === user.id)?.display_name || "Your DM";
  const campaign = await campaignName(campaignId);
  const recipients = await resolveRecipients(optedIn, members);
  const sent = await sendAll(recipients.map((r) => buildMail(campaign, dmName, r)), apiKey);
  return json({ sent });
}));

interface IssuedInvite {
  token: string;
  sequence: number;
}

/**
 * Mints one RSVP token per recipient. Membership is re-derived inside the RPC,
 * so the ids handed over are a hint, not a grant. A failure is non-fatal by
 * design: the mailing still goes out, just without the one-click links and the
 * invitation — the player answers in Grimoire as they always could.
 */
async function issueRsvpTokens(
  proposalId: string,
  recipientIds: string[],
  into: Map<string, IssuedInvite>,
): Promise<void> {
  if (!recipientIds.length) return;
  const { data, error } = await admin.rpc("issue_session_rsvp_invites", {
    p_proposal_id: proposalId,
    p_user_ids: recipientIds,
  });
  if (error) {
    console.error("send-notification-email: issue_session_rsvp_invites failed", error);
    return;
  }
  for (const row of (data ?? []) as { user_id: string; token: string; sequence: number }[]) {
    into.set(row.user_id, { token: row.token, sequence: row.sequence });
  }
}
