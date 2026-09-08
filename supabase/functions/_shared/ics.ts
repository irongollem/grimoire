/**
 * iCalendar (RFC 5545) composition and iTIP (RFC 5546) reply parsing.
 *
 * Pure — no Deno imports — for two reasons. It is unit-tested by vitest
 * (`supabase/functions/**` is in the include list), and the browser imports it
 * through the `@edge-shared` alias so `SchedulingTab`'s "Export iCal" button
 * and the subscribed feed emit byte-identical events. They used to be two
 * hand-rolled builders and had already drifted: the client copy omitted DTEND,
 * DTSTAMP and text escaping, so a session with a comma in its title exported a
 * file some clients refused.
 *
 * Three products, one vocabulary:
 *
 *   buildSessionFeed()    METHOD:PUBLISH — the subscribed calendar feed.
 *   buildSessionInvite()  METHOD:REQUEST — the invitation mailed to one player,
 *                         which is what makes a mail app draw Accept/Decline.
 *   parseIcsReply()       METHOD:REPLY  — what that mail app sends back.
 */

/** Max line length per RFC 5545 §3.1 (75 octets, not chars — close enough for ASCII). */
const LINE_MAX = 75;

export const PRODID = "-//Grimoire//DnD Campaign Manager//EN";

/**
 * The label a suggested date wears in a calendar app. A prefix rather than a
 * suffix on purpose: month view truncates the summary to a few characters, and
 * the one thing a player must be able to see at that width is that the evening
 * is not booked yet. STATUS:TENTATIVE alone does not survive the trip — most
 * clients render a subscribed feed's events identically whatever their status.
 */
export const PROPOSED_PREFIX = "Proposed: ";

export type SessionEventStatus = "proposed" | "confirmed";

export interface IcsSessionEvent {
  id: string;
  title: string;
  notes: string | null;
  /** YYYY-MM-DD, wall-clock, no zone. */
  date: string;
  /** HH:mm[:ss] wall-clock, or null for an all-day entry. */
  time: string | null;
  durationMinutes: number | null;
  status: SessionEventStatus;
}

// ── Primitives ────────────────────────────────────────────────────────────────

export function foldLine(line: string): string {
  if (line.length <= LINE_MAX) return line;
  const parts: string[] = [line.slice(0, LINE_MAX)];
  let offset = LINE_MAX;
  while (offset < line.length) {
    parts.push(" " + line.slice(offset, offset + LINE_MAX - 1));
    offset += LINE_MAX - 1;
  }
  return parts.join("\r\n");
}

/** Reverse of foldLine: a CRLF (or bare LF/CR) followed by one space or tab. */
export function unfold(raw: string): string {
  return raw.replace(/\r\n[ \t]|\n[ \t]|\r[ \t]/g, "");
}

export function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n/g, "\\n")
    .replace(/[\r\n]/g, "\\n");
}

/**
 * A parameter value (CN=…), which is NOT escaped the way a property value is.
 * RFC 5545 §3.2 has no backslash escapes here: a value containing `:`, `;` or
 * `,` must be DQUOTE-quoted instead, and a quoted value cannot itself contain a
 * quote — so an embedded one is dropped rather than smuggled out of the string.
 * Getting this wrong writes `CN=Jeffrey\, the DM`, which strict parsers reject
 * and lenient ones render with the backslash showing.
 */
export function paramValue(raw: string): string {
  const cleaned = raw.replace(/["\r\n]/g, "").trim();
  return /[:;,]/.test(cleaned) ? `"${cleaned}"` : cleaned;
}

/** A Date → 20260805T190000Z, the UTC form DTSTAMP requires. */
export function formatUtcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Wall-clock arithmetic that never touches the host timezone. `new Date(iso)`
 * without a Z parses in the *runtime's* zone, so the same proposal rendered on
 * a UTC edge worker and in a browser in Auckland produced different DTENDs —
 * and an evening session could roll to the wrong day. Date.UTC in, UTC getters
 * out: the numbers pass through unchanged, which is what a floating time means.
 */
export function addMinutes(
  date: string,
  time: string,
  minutes: number,
): { date: string; time: string } {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const t = new Date(Date.UTC(y, mo - 1, d, h, mi));
  t.setUTCMinutes(t.getUTCMinutes() + minutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`,
    time: `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`,
  };
}

function addDays(date: string, days: number): string {
  return addMinutes(date, "00:00", days * 24 * 60).date;
}

const compactDate = (date: string) => date.replace(/-/g, "");
const compactTime = (time: string) => time.replace(/:/g, "").slice(0, 4) + "00";

/** DTSTART/DTEND for one event — timed events float, dateless ones are all-day. */
function timeBounds(ev: IcsSessionEvent): string[] {
  if (!ev.time) {
    return [
      `DTSTART;VALUE=DATE:${compactDate(ev.date)}`,
      `DTEND;VALUE=DATE:${compactDate(addDays(ev.date, 1))}`,
    ];
  }
  const end = addMinutes(ev.date, ev.time, ev.durationMinutes ?? 240);
  return [
    `DTSTART:${compactDate(ev.date)}T${compactTime(ev.time)}`,
    `DTEND:${compactDate(end.date)}T${compactTime(end.time)}`,
  ];
}

/**
 * The event's identity, stable across its whole life. A proposal and the
 * session it becomes are the same `session_proposals` row, so they must share a
 * UID: a client that has already stored the tentative entry then *replaces* it
 * on confirmation instead of leaving the player with two evenings booked.
 */
export function eventUid(proposalId: string): string {
  return `${proposalId}@grimoire`;
}

export function summaryFor(campaignName: string, ev: IcsSessionEvent): string {
  const base = `${campaignName} — ${ev.title}`;
  return ev.status === "proposed" ? `${PROPOSED_PREFIX}${base}` : base;
}

function describe(ev: IcsSessionEvent, respondUrl: string | null): string | null {
  const parts: string[] = [];
  if (ev.notes) parts.push(ev.notes);
  if (ev.status === "proposed") {
    parts.push(
      "This date is a suggestion — the table has not settled on it yet. " +
        "Say whether you can make it and your DM will confirm or move it.",
    );
    if (respondUrl) parts.push(respondUrl);
  }
  return parts.length ? parts.join("\n\n") : null;
}

// ── The feed (METHOD:PUBLISH) ────────────────────────────────────────────────

export interface SessionFeedOptions {
  campaignName: string;
  events: IcsSessionEvent[];
  /** Injected so tests are deterministic; the caller passes `new Date()`. */
  now: Date;
  /** Where a player goes to answer a suggestion. Omitted from the export file. */
  respondUrl?: string | null;
}

/**
 * A subscribed calendar is replaced wholesale on every fetch, so there is no
 * cancellation bookkeeping here: a proposal that is dropped or declined simply
 * stops being emitted and disappears from the player's calendar on the next poll.
 */
export function buildSessionFeed(opts: SessionFeedOptions): string {
  const { campaignName, events, now } = opts;
  const respondUrl = opts.respondUrl ?? null;
  const dtstamp = formatUtcStamp(now);

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(campaignName)} — Sessions`,
  ];

  for (const ev of events) {
    const description = describe(ev, respondUrl);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${eventUid(ev.id)}`,
      `DTSTAMP:${dtstamp}`,
      ...timeBounds(ev),
      `SUMMARY:${escapeText(summaryFor(campaignName, ev))}`,
      ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
      `STATUS:${ev.status === "proposed" ? "TENTATIVE" : "CONFIRMED"}`,
      // A suggestion must not book the evening out. TRANSP is the RFC 5545
      // spelling; the X- property is the one Outlook actually reads.
      ...(ev.status === "proposed"
        ? ["TRANSP:TRANSPARENT", "X-MICROSOFT-CDO-BUSYSTATUS:FREE"]
        : ["TRANSP:OPAQUE"]),
      "END:VEVENT",
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n");
}

// ── The invitation (METHOD:REQUEST) ──────────────────────────────────────────

export interface SessionInviteOptions {
  campaignName: string;
  event: IcsSessionEvent;
  now: Date;
  /** mailto address the reply is sent to — carries the per-recipient token. */
  organizerEmail: string;
  organizerName: string;
  attendeeEmail: string;
  attendeeName?: string | null;
  /** Bumped when the DM edits the date, so clients accept the newer copy. */
  sequence: number;
  respondUrl?: string | null;
}

/**
 * The part that makes Gmail, Apple Mail and Outlook draw Accept / Maybe /
 * Decline on the message. Accepting mails a METHOD:REPLY back to ORGANIZER —
 * see parseIcsReply and the session-rsvp-inbound function, which is the whole
 * reason the organizer address is per-recipient rather than a shared inbox.
 */
export function buildSessionInvite(opts: SessionInviteOptions): string {
  const { campaignName, event, now, organizerEmail, organizerName, attendeeEmail } = opts;
  const description = describe(event, opts.respondUrl ?? null);
  const attendeeParams = [
    ...(opts.attendeeName ? [`CN=${paramValue(opts.attendeeName)}`] : []),
    "ROLE=REQ-PARTICIPANT",
    "PARTSTAT=NEEDS-ACTION",
    "RSVP=TRUE",
  ].join(";");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${eventUid(event.id)}`,
    `DTSTAMP:${formatUtcStamp(now)}`,
    `SEQUENCE:${Math.max(0, Math.trunc(opts.sequence))}`,
    ...timeBounds(event),
    `SUMMARY:${escapeText(summaryFor(campaignName, event))}`,
    ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
    `ORGANIZER;CN=${paramValue(organizerName)}:mailto:${organizerEmail}`,
    `ATTENDEE;${attendeeParams}:mailto:${attendeeEmail}`,
    `STATUS:${event.status === "proposed" ? "TENTATIVE" : "CONFIRMED"}`,
    ...(event.status === "proposed"
      ? ["TRANSP:TRANSPARENT", "X-MICROSOFT-CDO-BUSYSTATUS:FREE"]
      : ["TRANSP:OPAQUE"]),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n");
}

// ── The reply (METHOD:REPLY) ─────────────────────────────────────────────────

export type Partstat = "ACCEPTED" | "DECLINED" | "TENTATIVE" | "NEEDS-ACTION" | "DELEGATED";

export interface IcsReply {
  /** The `session_proposals.id` the reply is about, recovered from the UID. */
  proposalId: string | null;
  /** The token lifted out of the organizer address we minted the invite with. */
  token: string | null;
  partstat: Partstat | null;
  attendeeEmail: string | null;
}

const PARTSTATS: Partstat[] = ["ACCEPTED", "DECLINED", "TENTATIVE", "NEEDS-ACTION", "DELEGATED"];

/** `rsvp+<uuid>@example.com` → the uuid. Anything else → null. */
export function tokenFromAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const local = address.trim().replace(/^mailto:/i, "").split("@")[0] ?? "";
  const plus = local.indexOf("+");
  if (plus < 0) return null;
  const candidate = local.slice(plus + 1);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate.toLowerCase()
    : null;
}

function contentLines(raw: string): string[] {
  return unfold(raw).split(/\r\n|\n|\r/);
}

/** Splits `ATTENDEE;PARTSTAT=ACCEPTED:mailto:x@y` into its name, params and value. */
function parseProperty(line: string): { name: string; params: string; value: string } | null {
  // The first colon that is not inside a quoted parameter value ends the
  // name+params half. Quoting matters: `CN="Smith:Jr"` is legal.
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ":" && !inQuotes) {
      const head = line.slice(0, i);
      const semi = head.indexOf(";");
      return {
        name: (semi < 0 ? head : head.slice(0, semi)).toUpperCase(),
        params: semi < 0 ? "" : head.slice(semi + 1),
        value: line.slice(i + 1),
      };
    }
  }
  return null;
}

/**
 * Reads whatever a mail client sends back. Deliberately tolerant about shape
 * (any of the three identifiers may be missing) and strict about meaning: an
 * unrecognised PARTSTAT is null rather than a guess, because the caller turns
 * this into a yes or a no on someone's behalf.
 */
export function parseIcsReply(raw: string): IcsReply {
  const out: IcsReply = { proposalId: null, token: null, partstat: null, attendeeEmail: null };
  for (const line of contentLines(raw)) {
    const prop = parseProperty(line);
    if (!prop) continue;
    if (prop.name === "UID" && !out.proposalId) {
      const uid = prop.value.trim();
      out.proposalId = uid.endsWith("@grimoire") ? uid.slice(0, -"@grimoire".length) : null;
    } else if (prop.name === "ORGANIZER" && !out.token) {
      out.token = tokenFromAddress(prop.value);
    } else if (prop.name === "ATTENDEE" && !out.partstat) {
      const match = /PARTSTAT=([A-Za-z-]+)/i.exec(prop.params);
      const stat = match?.[1]?.toUpperCase() as Partstat | undefined;
      if (stat && PARTSTATS.includes(stat)) {
        out.partstat = stat;
        out.attendeeEmail = prop.value.trim().replace(/^mailto:/i, "").toLowerCase() || null;
      }
    }
  }
  return out;
}

/**
 * The mapping from an iTIP answer to Grimoire's boolean availability.
 *
 * TENTATIVE ("Maybe") returns null and is deliberately NOT recorded. The app's
 * own control is two-state, and writing a maybe as a yes would tell the DM the
 * player is coming — a wrong answer given in the player's name, which is worse
 * than no answer. DELEGATED and NEEDS-ACTION are likewise nothing to record.
 */
export function availabilityFromPartstat(partstat: Partstat | null): boolean | null {
  if (partstat === "ACCEPTED") return true;
  if (partstat === "DECLINED") return false;
  return null;
}
