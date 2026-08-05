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
 */
import { serve } from "std/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { checkRateLimit } from "../_shared/rate-limit.ts";
import { noteSharedEmail, proposalCreatedEmail, type EmailContent } from "./emails.ts";

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

async function resolveEmails(userIds: string[]): Promise<string[]> {
  const results = await Promise.all(
    userIds.map(async (id) => {
      const { data, error } = await admin.auth.admin.getUserById(id);
      if (error) {
        console.error(`send-notification-email: getUserById(${id}) failed`, error);
        return null;
      }
      return data.user?.email ?? null;
    }),
  );
  return results.filter((e): e is string => !!e);
}

async function sendAll(recipients: string[], email: EmailContent, apiKey: string): Promise<number> {
  let sent = 0;
  for (const to of recipients) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: Deno.env.get("NOTIFY_FROM_EMAIL") || DEFAULT_FROM,
        to: [to],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });
    if (res.ok) sent++;
    else console.error(`send-notification-email: Resend ${res.status} for one recipient:`, await res.text());
  }
  return sent;
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
  let buildEmail: (campaign: string, dmName: string) => EmailContent;

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
    buildEmail = (campaign, dmName) =>
      noteSharedEmail({ campaignName: campaign, dmName, noteTitle, noteId });
  } else if (body.type === "proposal_created") {
    if (!body.proposal_id) return json({ error: "proposal_created needs { proposal_id }" }, 400);
    const { data: proposal, error } = await admin
      .from("session_proposals")
      .select("id, campaign_id, title, proposed_date, proposed_time, status")
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
    buildEmail = (campaign, dmName) =>
      proposalCreatedEmail({
        campaignName: campaign,
        dmName,
        proposalTitle: (proposal.title as string) || "Session",
        proposedDate: proposal.proposed_date as string,
        proposedTime: proposal.proposed_time as string | null,
      });
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

  const dmName = members.find((m) => m.user_id === user.id)?.display_name || "Your DM";
  const email = buildEmail(await campaignName(campaignId), dmName);
  const emails = await resolveEmails(optedIn);
  const sent = await sendAll(emails, email, apiKey);
  return json({ sent });
}));
