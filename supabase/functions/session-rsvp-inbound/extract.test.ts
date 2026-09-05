import { describe, it, expect } from "vitest";
import { decodeQuotedPrintable, extractCalendar, secretMatches } from "./extract.ts";

const REPLY = [
  "BEGIN:VCALENDAR",
  "METHOD:REPLY",
  "BEGIN:VEVENT",
  "UID:11111111-2222-3333-4444-555555555555@grimoire",
  "ORGANIZER:mailto:rsvp+aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee@dungeongrimoire.com",
  "ATTENDEE;PARTSTAT=ACCEPTED:mailto:player@example.invalid",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

describe("extractCalendar", () => {
  it("takes a text/calendar body as-is", () => {
    expect(extractCalendar("text/calendar; method=REPLY", REPLY)).toContain("PARTSTAT=ACCEPTED");
  });

  it("finds the calendar inside a raw MIME message", () => {
    const mime = [
      "From: player@example.invalid",
      "Content-Type: multipart/mixed; boundary=xyz",
      "",
      "--xyz",
      "Content-Type: text/plain",
      "",
      "Accepted: Session 12",
      "--xyz",
      "Content-Type: text/calendar; method=REPLY",
      "",
      REPLY,
      "--xyz--",
    ].join("\r\n");
    expect(extractCalendar("message/rfc822", mime)).toContain("PARTSTAT=ACCEPTED");
    // Nothing after END:VCALENDAR leaks into the parsed body.
    expect(extractCalendar("message/rfc822", mime)).not.toContain("--xyz--");
  });

  it("reads an explicit ics field in a JSON webhook body", () => {
    const body = JSON.stringify({ type: "email.received", data: { ics: REPLY } });
    expect(extractCalendar("application/json", body)).toContain("PARTSTAT=ACCEPTED");
  });

  it("reads a base64 attachment, which is how most providers hand one over", () => {
    const body = JSON.stringify({
      To: "rsvp+aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee@dungeongrimoire.com",
      Attachments: [
        { Name: "logo.png", Content: b64("not a calendar, just some bytes to skip past") },
        { Name: "invite.ics", ContentType: "text/calendar", Content: b64(REPLY) },
      ],
    });
    expect(extractCalendar("application/json", body)).toContain("PARTSTAT=ACCEPTED");
  });

  it("reads a quoted-printable part, unfolding its soft breaks", () => {
    const qp = [
      "Content-Type: text/calendar; method=REPLY",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      REPLY.replace(
        "ATTENDEE;PARTSTAT=ACCEPTED:mailto:player@example.invalid",
        "ATTENDEE=3BPARTSTAT=3DACCEPTED:mailto:player@examp=\r\nle.invalid",
      ),
    ].join("\r\n");
    expect(extractCalendar("message/rfc822", qp))
      .toContain("ATTENDEE;PARTSTAT=ACCEPTED:mailto:player@example.invalid");
  });

  it("leaves a part that is not quoted-printable alone", () => {
    // The trap: `=` is ordinary iCalendar punctuation, so an unconditional QP
    // decode rewrites PARTSTAT=ACCEPTED into nonsense — the one field read here.
    const mime = ["Content-Type: text/calendar; method=REPLY", "", REPLY].join("\r\n");
    expect(extractCalendar("message/rfc822", mime)).toContain("PARTSTAT=ACCEPTED");
  });

  it("gives up rather than guessing when there is no calendar", () => {
    expect(extractCalendar("application/json", JSON.stringify({ subject: "hello" }))).toBeNull();
    expect(extractCalendar("text/plain", "just a note")).toBeNull();
    expect(extractCalendar("application/json", "{ not json")).toBeNull();
  });

  it("does not recurse forever into a deeply nested body", () => {
    let nested: unknown = REPLY;
    for (let i = 0; i < 40; i++) nested = { next: nested };
    // Bounded on purpose: an unbounded walk is a cheap way to burn a worker.
    expect(extractCalendar("application/json", JSON.stringify(nested))).toBeNull();
  });
});

describe("decodeQuotedPrintable", () => {
  it("joins soft breaks and decodes octets", () => {
    expect(decodeQuotedPrintable("a=3Db=\r\nc")).toBe("a=bc");
  });
});

describe("secretMatches", () => {
  it("accepts the exact secret and nothing else", () => {
    expect(secretMatches("s3cret", "s3cret")).toBe(true);
    expect(secretMatches("s3cret", "s3crEt")).toBe(false);
    expect(secretMatches("s3cret", "s3cre")).toBe(false);
    expect(secretMatches("s3cret", null)).toBe(false);
  });

  it("never accepts an unconfigured secret, even against an empty header", () => {
    expect(secretMatches("", "")).toBe(false);
    expect(secretMatches("", null)).toBe(false);
  });
});
