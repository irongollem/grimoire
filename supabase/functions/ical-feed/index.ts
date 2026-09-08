// Public ICS feed consumed by players' calendar apps (Google / Apple / Outlook).
//
// Those clients can't attach a Supabase JWT when subscribing to an ICS URL, so
// JWT verification is turned off at the gateway via
// `[functions.ical-feed] verify_jwt = false` in `supabase/config.toml`
// (per-function `config.toml` files inside the function directory are NOT read
// by `supabase functions deploy`). Security is the random per-campaign
// `ical_token` in the URL path.
//
// WHAT IT CARRIES, AND WHY THAT CHANGED. The feed used to be confirmed
// sessions only. That is the state a calendar is *for*, but it is not when
// players look: most of the party opens Grimoire on session day, so a date the
// DM suggested on Tuesday reached nobody until it was already settled — the
// suggestion was invisible during the only window in which answering it does
// any good. Proposed dates are now published too, as TENTATIVE, TRANSPARENT
// (they must not book the evening out) and labelled in the SUMMARY, which is
// the only marker that survives a month-view truncation. See _shared/ics.ts.
//
// Both states are the same `session_proposals` row and so share one UID: a
// client that stored the suggestion replaces it when the DM confirms, rather
// than leaving the player with two evenings booked. Cancelled rows are simply
// not emitted, and a subscribed calendar is replaced wholesale on each poll,
// so dropping one is how it disappears.
//
// Still never published: notes on cancelled or past sessions, per-player
// availability, or anything else a campaign member has not already been shown.
// The token is shared by the whole party, so the feed must hold nothing that
// distinguishes one member from another — the per-player RSVP path is the
// emailed invitation instead (see session-rsvp).
import { withErrorReporting } from "../_shared/observability/report.ts";
import { createClient } from "@supabase/supabase-js";
import { buildSessionFeed, type IcsSessionEvent } from "../_shared/ics.ts";

const RESPOND_URL = "https://app.dungeongrimoire.com/play/settings";

interface SessionRow {
  id: string;
  title: string;
  notes: string | null;
  proposed_date: string;
  proposed_time: string | null;
  duration_minutes: number;
  status: "proposed" | "confirmed";
  updated_at: string;
}

interface CampaignRow {
  id: string;
  name: string;
}

Deno.serve(withErrorReporting(async (req: Request) => {
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Extract token from URL path: /functions/v1/ical-feed/<token>
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const token = pathParts[pathParts.length - 1];

  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) {
    return new Response("Not Found", { status: 404 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Look up the campaign by ical_token
  const { data: campaign, error: campErr } = await supabase
    .from("campaigns")
    .select("id, name")
    .eq("ical_token", token)
    .single<CampaignRow>();

  if (campErr || !campaign) {
    return new Response("Not Found", { status: 404 });
  }

  // Confirmed and proposed, future only (today inclusive). Cancelled is
  // excluded by the filter, not by an afterthought — see the header note.
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: sessions, error: sessErr } = await supabase
    .from("session_proposals")
    .select("id, title, notes, proposed_date, proposed_time, duration_minutes, status, updated_at")
    .eq("campaign_id", campaign.id)
    .in("status", ["confirmed", "proposed"])
    .gte("proposed_date", todayIso)
    .order("proposed_date", { ascending: true });

  if (sessErr) {
    console.error("ical-feed sessions error:", sessErr);
    return new Response("Internal Server Error", { status: 500 });
  }

  const rows = (sessions ?? []) as SessionRow[];

  // Compute Last-Modified from the latest updated_at across all rows
  const lastModDate = rows.length > 0
    ? new Date(rows.reduce((max, r) => r.updated_at > max ? r.updated_at : max, rows[0].updated_at))
    : new Date();
  const lastModified = lastModDate.toUTCString();
  const etag = `"${lastModDate.getTime().toString(36)}"`;

  // Conditional GET support
  if (req.headers.get("If-None-Match") === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag, "Last-Modified": lastModified } });
  }

  const events: IcsSessionEvent[] = rows.map((s) => ({
    id: s.id,
    title: s.title,
    notes: s.notes,
    date: s.proposed_date,
    time: s.proposed_time,
    durationMinutes: s.duration_minutes,
    status: s.status,
  }));

  const body = buildSessionFeed({
    campaignName: campaign.name,
    events,
    now: new Date(),
    respondUrl: RESPOND_URL,
  });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar;charset=utf-8",
      "Content-Disposition": `attachment; filename="${campaign.name.replace(/[^a-z0-9]/gi, "_")}_sessions.ics"`,
      "Cache-Control": "public, max-age=3600",
      ETag: etag,
      "Last-Modified": lastModified,
    },
  });
}));
