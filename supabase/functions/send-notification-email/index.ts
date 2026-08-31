/**
 * Player email notifications — "your DM shared a session note with you" and
 * "a new session date was proposed".
 *
 * Invoked fire-and-forget from the app right after the DM action
 * (NoteEditor / SchedulingTab), NOT from a DB trigger: campaign backup
 * restore inserts straight into `notes` / `session_proposals`, and a trigger
 * would re-email every player about years-old content on every restore.
 *
 * Trust boundary: the client only names WHICH rows changed. Recipients are
 * re-derived here from DB state (player_visible_to ∩ the claimed ids →
 * campaign_members → auth.users.email) with the caller verified as a DM of
 * that campaign — player emails never reach the browser, and a caller can't
 * email anyone the row itself doesn't grant.
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
import {
  noteSharedEmail,
  proposalCreatedEmail,
  type EmailContent,
  type RsvpLinks,
} from "./emails.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const DEFAULT_FROM = "Grimoire <notifications@dungeongrimoire.com>";

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

interface Attachment {
  filename: string;
  content: string;
  content_type: string;
}

interface OutgoingMail {
  to: string;
  content: EmailContent;
  attachments?: Attachment[];
  replyTo?: string;
}

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
async function filterByPreference(
  userIds: string[],
  column: "email_shared_notes" | "email_session_proposals",
): Promise<string[]> {
  if (!userIds.length) return [];
  const { data, error } = await admin
    .from("notification_preferences")
    .select(`user_id, ${column}`)
    .in("user_id", userIds);
  if (error) throw error;
  const optedOut = new Set(
    (data ?? [])
      .filter((row) => (row as Record<string, unknown>)[column] === false)
      .map((row) => (row as { user_id: string }).user_id),
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
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: Deno.env.get("NOTIFY_FROM_EMAIL") || DEFAULT_FROM,
        to: [mail.to],
        subject: mail.content.subject,
        html: mail.content.html,
        text: mail.content.text,
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
        ...(mail.attachments?.length ? { attachments: mail.attachments } : {}),
      }),
    });
    if (res.ok) sent++;
    else console.error(`send-notification-email: Resend ${res.status} for one recipient:`, await res.text());
  }
  return sent;
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
    note_id?: string;
    added_party_member_ids?: unknown;
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
  let prefColumn: "email_shared_notes" | "email_session_proposals";
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

  if (body.type === "note_shared") {
    if (!body.note_id || !Array.isArray(body.added_party_member_ids)) {
      return json({ error: "note_shared needs { note_id, added_party_member_ids }" }, 400);
    }
    const { data: note, error } = await admin
      .from("notes")
      .select("id, title, campaign_id, player_visible_to")
      .eq("id", body.note_id)
      .maybeSingle();
    if (error) throw error;
    if (!note?.campaign_id) return json({ error: "Note not found" }, 404);
    campaignId = note.campaign_id as string;

    members = await fetchMembers(campaignId);
    if (!members.some((m) => m.user_id === user.id && m.role === "dm")) {
      return new Response("Forbidden", { status: 403 });
    }

    // Only ids the note actually grants visibility to — the client's "added"
    // list is an optimization hint, never an authority.
    const visible = new Set((note.player_visible_to as string[] | null) ?? []);
    const added = new Set(
      (body.added_party_member_ids as unknown[]).filter(
        (id): id is string => typeof id === "string" && visible.has(id),
      ),
    );
    recipientIds = members
      .filter((m) => m.party_member_id && added.has(m.party_member_id) && m.user_id !== user.id)
      .map((m) => m.user_id);
    prefColumn = "email_shared_notes";
    const noteTitle = (note.title as string) || "Untitled Note";
    const noteId = note.id as string;
    buildMail = (campaign, dmName, recipient) => ({
      to: recipient.email,
      content: noteSharedEmail({ campaignName: campaign, dmName, noteTitle, noteId }),
    });
  } else if (body.type === "proposal_created") {
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
    prefColumn = "email_session_proposals";

    const proposalId = proposal.id as string;
    const proposalTitle = (proposal.title as string) || "Session";
    const proposedDate = proposal.proposed_date as string;
    const proposedTime = proposal.proposed_time as string | null;

    // Minted before the send loop, so a failure here degrades the whole
    // mailing to link-free rather than half the party getting buttons.
    const tokens = new Map<string, IssuedInvite>();
    prepare = async (optedIn) => { await issueRsvpTokens(proposalId, optedIn, tokens); };

    const inboundDomain = (Deno.env.get("RSVP_INBOUND_DOMAIN") ?? "").trim().toLowerCase();
    const rsvpEndpoint = `${Deno.env.get("SUPABASE_URL")}/functions/v1/session-rsvp`;
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

  recipientIds = [...new Set(recipientIds)];
  const optedIn = await filterByPreference(recipientIds, prefColumn);
  if (!optedIn.length) return json({ sent: 0 });

  const apiKey = Deno.env.get("RESEND_API_KEY");
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
