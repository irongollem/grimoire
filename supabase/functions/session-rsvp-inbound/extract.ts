// The pure half of session-rsvp-inbound: pulling a METHOD:REPLY out of whatever
// an inbound-email provider posts. No Deno imports, so vitest covers it.
//
// There is no standard here. Every provider that can deliver inbound mail to a
// webhook has invented its own envelope, so this reads several and gives up
// honestly rather than half-parsing one. What they have in common is that the
// iCalendar text is in there somewhere — as an explicit field, as a base64
// attachment, or inline in the raw MIME — and it always contains the literal
// "BEGIN:VCALENDAR". That string is the anchor.

const CAL_MARKER = "BEGIN:VCALENDAR";
const CAL_END = "END:VCALENDAR";

/**
 * Trim anything around the calendar object and undo quoted-printable if the
 * MIME part it sat in declared it.
 *
 * The transfer encoding is read from the part's own headers rather than
 * sniffed, and that is not fussiness: `=` is ordinary iCalendar punctuation
 * (`PARTSTAT=ACCEPTED`, `FREQ=WEEKLY`), so a QP decode applied to a part that
 * was not QP-encoded silently rewrites `PARTSTAT=ACCEPTED` to `PARTSTAT¬CEPTED`
 * — the one field this whole endpoint exists to read.
 */
function sliceCalendar(text: string): string | null {
  const start = text.indexOf(CAL_MARKER);
  if (start < 0) return null;
  const end = text.indexOf(CAL_END, start);
  const body = end < 0 ? text.slice(start) : text.slice(start, end + CAL_END.length);
  const headers = text.slice(Math.max(0, start - 1000), start);
  return /content-transfer-encoding:\s*quoted-printable/i.test(headers)
    ? decodeQuotedPrintable(body)
    : body;
}

/**
 * Quoted-printable, which is how a 7-bit MIME part carries a calendar body.
 * Soft line breaks first (`=` at end of line), then the =XX octets.
 */
export function decodeQuotedPrintable(text: string): string {
  return text
    .replace(/=(?:\r\n|\n|\r)/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeBase64(value: string): string | null {
  try {
    const binary = atob(value.replace(/\s+/g, ""));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/** Every string leaf of a JSON payload, depth- and size-bounded. */
function* strings(value: unknown, depth = 0): Generator<string> {
  if (depth > 6) return;
  if (typeof value === "string") {
    yield value;
  } else if (Array.isArray(value)) {
    for (const item of value) yield* strings(item, depth + 1);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) yield* strings(item, depth + 1);
  }
}

/**
 * The calendar body, from any of the shapes providers post.
 *
 * In order: a body that is already `text/calendar`; a plain string leaf that
 * contains the marker (an explicit `ics` field, a Postmark `TextBody`, a raw
 * MIME part that was sent 7-bit or quoted-printable); and finally a base64
 * leaf that decodes to one, which covers a provider handing attachments over
 * as base64 without saying which is which.
 *
 * Bounded on purpose: this endpoint is reachable by anything holding the
 * webhook secret, and an unbounded scan over an arbitrarily nested body is a
 * cheap way to burn an edge worker.
 */
export function extractCalendar(contentType: string, rawBody: string): string | null {
  const type = contentType.toLowerCase();

  if (type.includes("text/calendar")) {
    return sliceCalendar(rawBody) ?? rawBody;
  }

  // JSON is checked before the raw scan, and by shape as well as by header: a
  // webhook body carrying an ICS as a JSON string has the marker in it, but its
  // newlines are the two characters `\` and `n`, so scanning the envelope
  // directly yields one unparseable line that looks like a success.
  const looksJson = type.includes("json") || /^\s*[[{]/.test(rawBody);
  if (!looksJson) {
    const direct = sliceCalendar(rawBody);
    if (direct) return direct;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return looksJson ? sliceCalendar(rawBody) : null;
  }

  const leaves: string[] = [];
  for (const leaf of strings(parsed)) {
    if (leaves.length >= 200) break;
    leaves.push(leaf);
  }

  for (const leaf of leaves) {
    const found = sliceCalendar(leaf);
    if (found) return found;
  }

  for (const leaf of leaves) {
    // Base64 attachments are long and alphabet-restricted; skip anything that
    // obviously is not one before paying for a decode.
    if (leaf.length < 40 || !/^[A-Za-z0-9+/=\s]+$/.test(leaf)) continue;
    const decoded = decodeBase64(leaf);
    const found = decoded ? sliceCalendar(decoded) : null;
    if (found) return found;
  }

  return null;
}

/**
 * A constant-time-ish comparison for the webhook secret. Not a defence against
 * a local attacker — this is an edge function behind a CDN — but it costs one
 * loop and removes the trivially measurable early return.
 */
export function secretMatches(expected: string, provided: string | null): boolean {
  if (!expected || !provided || expected.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  return diff === 0;
}
