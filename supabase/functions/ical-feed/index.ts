import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// This function is public — calendar clients (Google / Apple / Outlook) can't
// attach a Supabase JWT when subscribing to an ICS URL. JWT verification is
// turned off at the gateway via `[functions.ical-feed] verify_jwt = false`
// in `supabase/config.toml` (per-function `config.toml` files inside the
// function directory are NOT read by `supabase functions deploy`). Security
// is enforced by the random per-campaign `ical_token` in the URL path —
// we only return CONFIRMED sessions to holders of the right token, and we
// never leak draft / private scheduling state.

// Max line length per RFC 5545 §3.1 (75 octets, not chars — close enough for ASCII)
const LINE_MAX = 75;

function foldLine(line: string): string {
  if (line.length <= LINE_MAX) return line;
  const parts: string[] = [];
  parts.push(line.slice(0, LINE_MAX));
  let offset = LINE_MAX;
  while (offset < line.length) {
    parts.push(" " + line.slice(offset, offset + LINE_MAX - 1));
    offset += LINE_MAX - 1;
  }
  return parts.join("\r\n");
}

function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function formatDtstamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

interface SessionRow {
  id: string;
  title: string;
  notes: string | null;
  proposed_date: string;
  proposed_time: string | null;
  duration_minutes: number;
  updated_at: string;
}

interface CampaignRow {
  id: string;
  name: string;
}

Deno.serve(async (req: Request) => {
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

  // Fetch confirmed sessions — only future ones (today inclusive)
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: sessions, error: sessErr } = await supabase
    .from("session_proposals")
    .select("id, title, notes, proposed_date, proposed_time, duration_minutes, updated_at")
    .eq("campaign_id", campaign.id)
    .eq("status", "confirmed")
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

  const now = new Date();
  const dtstamp = formatDtstamp(now);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Grimoire//DnD Campaign Manager//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldLine(`X-WR-CALNAME:${escapeText(campaign.name)} — Sessions`),
  ];

  for (const s of rows) {
    const dateStr = s.proposed_date.replace(/-/g, "");
    let dtstart: string;
    let dtend: string;

    if (s.proposed_time) {
      const timeStr = s.proposed_time.replace(/:/g, "").slice(0, 4) + "00";
      dtstart = `DTSTART:${dateStr}T${timeStr}`;
      // Default session length: 4 hours — endDate may roll over to next calendar day
      const [h, m] = s.proposed_time.split(":").map(Number);
      const endDate = new Date(`${s.proposed_date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
      endDate.setMinutes(endDate.getMinutes() + (s.duration_minutes ?? 240));
      const pad2 = (n: number) => String(n).padStart(2, "0");
      const endDateStr = `${endDate.getFullYear()}${pad2(endDate.getMonth() + 1)}${pad2(endDate.getDate())}`;
      const endTimeStr = `${pad2(endDate.getHours())}${pad2(endDate.getMinutes())}00`;
      dtend = `DTEND:${endDateStr}T${endTimeStr}`;
    } else {
      dtstart = `DTSTART;VALUE=DATE:${dateStr}`;
      // All-day: end is next calendar day
      const d = new Date(s.proposed_date + "T00:00:00");
      d.setDate(d.getDate() + 1);
      const nextDay = d.toISOString().slice(0, 10).replace(/-/g, "");
      dtend = `DTEND;VALUE=DATE:${nextDay}`;
    }

    lines.push(
      "BEGIN:VEVENT",
      `UID:${s.id}@grimoire`,
      `DTSTAMP:${dtstamp}`,
      dtstart,
      dtend,
      foldLine(`SUMMARY:${escapeText(campaign.name)} — ${escapeText(s.title)}`),
      ...(s.notes ? [foldLine(`DESCRIPTION:${escapeText(s.notes)}`)] : []),
      "STATUS:CONFIRMED",
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");

  const body = lines.join("\r\n");

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
});
