import { describe, it, expect } from "vitest";
import {
  addMinutes,
  availabilityFromPartstat,
  buildSessionFeed,
  buildSessionInvite,
  escapeText,
  eventUid,
  foldLine,
  paramValue,
  parseIcsReply,
  PROPOSED_PREFIX,
  tokenFromAddress,
  unfold,
  type IcsSessionEvent,
} from "./ics.ts";

const NOW = new Date("2026-08-31T09:15:00.000Z");

function event(over: Partial<IcsSessionEvent> = {}): IcsSessionEvent {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    title: "Session 12",
    notes: null,
    date: "2026-09-03",
    time: "19:30",
    durationMinutes: 240,
    status: "confirmed",
    ...over,
  };
}

/** Content lines as a client sees them — unfolded, split on CRLF. */
function lines(ics: string): string[] {
  return unfold(ics).split("\r\n");
}

describe("escaping and folding", () => {
  it("escapes the four characters RFC 5545 reserves", () => {
    expect(escapeText('a,b;c\\d\ne')).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("collapses CRLF to a single escaped newline", () => {
    expect(escapeText("a\r\nb")).toBe("a\\nb");
  });

  it("folds past 75 octets and unfold restores the original", () => {
    const long = "DESCRIPTION:" + "x".repeat(300);
    const folded = foldLine(long);
    expect(folded.split("\r\n").length).toBeGreaterThan(1);
    expect(folded.split("\r\n").every((l) => l.length <= 75)).toBe(true);
    expect(unfold(folded)).toBe(long);
  });
});

describe("addMinutes", () => {
  it("rolls a late session over midnight", () => {
    expect(addMinutes("2026-09-03", "22:00", 240)).toEqual({ date: "2026-09-04", time: "02:00" });
  });

  it("crosses a month boundary", () => {
    expect(addMinutes("2026-09-30", "23:00", 120)).toEqual({ date: "2026-10-01", time: "01:00" });
  });

  it("does not shift with the host timezone", () => {
    // The bug this replaces: `new Date("2026-09-03T19:30")` parses in the
    // runtime's zone, so an edge worker and a browser disagreed by hours.
    const tz = process.env.TZ;
    process.env.TZ = "Pacific/Auckland";
    try {
      expect(addMinutes("2026-09-03", "19:30", 240)).toEqual({ date: "2026-09-03", time: "23:30" });
    } finally {
      process.env.TZ = tz;
    }
  });
});

describe("buildSessionFeed", () => {
  it("labels a proposed date and leaves the evening free", () => {
    const out = lines(buildSessionFeed({
      campaignName: "Curse of Strahd",
      events: [event({ status: "proposed" })],
      now: NOW,
      respondUrl: "https://app.dungeongrimoire.com/play/settings",
    }));
    expect(out).toContain(`SUMMARY:${PROPOSED_PREFIX}Curse of Strahd — Session 12`);
    expect(out).toContain("STATUS:TENTATIVE");
    expect(out).toContain("TRANSP:TRANSPARENT");
    expect(out).toContain("X-MICROSOFT-CDO-BUSYSTATUS:FREE");
    expect(out.find((l) => l.startsWith("DESCRIPTION:"))).toContain("suggestion");
  });

  it("marks a confirmed date busy and drops the label", () => {
    const out = lines(buildSessionFeed({ campaignName: "Curse of Strahd", events: [event()], now: NOW }));
    expect(out).toContain("SUMMARY:Curse of Strahd — Session 12");
    expect(out).toContain("STATUS:CONFIRMED");
    expect(out).toContain("TRANSP:OPAQUE");
    expect(out.some((l) => l.startsWith("DESCRIPTION:"))).toBe(false);
  });

  it("gives a proposal and the session it becomes the same UID", () => {
    // Why it matters: a client that stored the tentative entry must replace it
    // on confirmation, not leave the player with two evenings booked.
    const proposed = lines(buildSessionFeed({ campaignName: "C", events: [event({ status: "proposed" })], now: NOW }));
    const confirmed = lines(buildSessionFeed({ campaignName: "C", events: [event()], now: NOW }));
    const uid = `UID:${eventUid(event().id)}`;
    expect(proposed).toContain(uid);
    expect(confirmed).toContain(uid);
  });

  it("emits a timed event as a floating local time with a computed end", () => {
    const out = lines(buildSessionFeed({ campaignName: "C", events: [event({ time: "19:30", durationMinutes: 300 })], now: NOW }));
    expect(out).toContain("DTSTART:20260903T193000");
    expect(out).toContain("DTEND:20260904T003000");
  });

  it("emits an all-day event when no time is set", () => {
    const out = lines(buildSessionFeed({ campaignName: "C", events: [event({ time: null })], now: NOW }));
    expect(out).toContain("DTSTART;VALUE=DATE:20260903");
    expect(out).toContain("DTEND;VALUE=DATE:20260904");
  });

  it("escapes a title that would otherwise break the file", () => {
    const out = lines(buildSessionFeed({ campaignName: "C", events: [event({ title: "Ambush, at last; run" })], now: NOW }));
    expect(out).toContain("SUMMARY:C — Ambush\\, at last\\; run");
  });

  it("produces a well-formed empty calendar when nothing is scheduled", () => {
    const out = lines(buildSessionFeed({ campaignName: "C", events: [], now: NOW }));
    expect(out[0]).toBe("BEGIN:VCALENDAR");
    expect(out.at(-1)).toBe("END:VCALENDAR");
    expect(out).toContain("METHOD:PUBLISH");
    expect(out.some((l) => l.startsWith("BEGIN:VEVENT"))).toBe(false);
  });

  it("never emits a line over 75 octets", () => {
    const ics = buildSessionFeed({
      campaignName: "A campaign with an unreasonably long name that keeps going",
      events: [event({ status: "proposed", notes: "x".repeat(400) })],
      now: NOW,
      respondUrl: "https://app.dungeongrimoire.com/play/settings",
    });
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true);
  });
});

describe("buildSessionInvite", () => {
  const invite = buildSessionInvite({
    campaignName: "Curse of Strahd",
    event: event({ status: "proposed" }),
    now: NOW,
    organizerEmail: "rsvp+aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee@dungeongrimoire.com",
    organizerName: "Jeffrey",
    attendeeEmail: "player@example.invalid",
    attendeeName: "Rowan",
    sequence: 2,
  });

  it("is a REQUEST that asks the attendee for an answer", () => {
    const out = lines(invite);
    expect(out).toContain("METHOD:REQUEST");
    expect(out).toContain("SEQUENCE:2");
    expect(out).toContain(
      "ORGANIZER;CN=Jeffrey:mailto:rsvp+aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee@dungeongrimoire.com",
    );
    expect(out).toContain(
      "ATTENDEE;CN=Rowan;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:player@example.invalid",
    );
  });

  it("shares the feed's UID so accepting updates the subscribed entry", () => {
    expect(lines(invite)).toContain(`UID:${eventUid(event().id)}`);
  });

  it("clamps a nonsense sequence rather than emitting an invalid property", () => {
    const out = lines(buildSessionInvite({
      campaignName: "C",
      event: event(),
      now: NOW,
      organizerEmail: "rsvp+x@d.com",
      organizerName: "DM",
      attendeeEmail: "p@example.invalid",
      sequence: -3,
    }));
    expect(out).toContain("SEQUENCE:0");
  });
});

describe("paramValue", () => {
  it("quotes a name with punctuation instead of backslash-escaping it", () => {
    // A property value takes `\,`; a parameter value does not, and a parser
    // that is strict about it rejects the whole invitation.
    expect(paramValue("Jeffrey, the DM")).toBe('"Jeffrey, the DM"');
    expect(paramValue("Jeffrey")).toBe("Jeffrey");
  });

  it("drops a quote rather than letting it close the quoting early", () => {
    expect(paramValue('Rowan "the Bold", ranger')).toBe('"Rowan the Bold, ranger"');
  });
});

describe("tokenFromAddress", () => {
  it("lifts a uuid out of a plus-addressed mailbox", () => {
    expect(tokenFromAddress("mailto:rsvp+AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE@d.com"))
      .toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });

  it("rejects anything that is not a uuid, and addresses with no tag", () => {
    expect(tokenFromAddress("mailto:rsvp+notauuid@d.com")).toBeNull();
    expect(tokenFromAddress("mailto:rsvp@d.com")).toBeNull();
    expect(tokenFromAddress(null)).toBeNull();
  });
});

describe("parseIcsReply", () => {
  const reply = [
    "BEGIN:VCALENDAR",
    "METHOD:REPLY",
    "BEGIN:VEVENT",
    "UID:11111111-2222-3333-4444-555555555555@grimoire",
    "ORGANIZER:mailto:rsvp+aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee@dungeongrimoire.com",
    "ATTENDEE;CN=Rowan;PARTSTAT=ACCEPTED:mailto:Player@Example.invalid",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  it("reads the proposal, the token and the answer", () => {
    expect(parseIcsReply(reply)).toEqual({
      proposalId: "11111111-2222-3333-4444-555555555555",
      token: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      partstat: "ACCEPTED",
      attendeeEmail: "player@example.invalid",
    });
  });

  it("reads a folded reply, which is how real clients send it", () => {
    const folded = reply.replace(
      "ATTENDEE;CN=Rowan;PARTSTAT=ACCEPTED:mailto:Player@Example.invalid",
      "ATTENDEE;CN=Rowan;PARTSTAT=ACCEPTED:mailto:Play\r\n er@Example.invalid",
    );
    expect(parseIcsReply(folded).attendeeEmail).toBe("player@example.invalid");
  });

  it("is not confused by a colon inside a quoted parameter", () => {
    const quoted = reply.replace('CN=Rowan', 'CN="Rowan: the Third"');
    expect(parseIcsReply(quoted).partstat).toBe("ACCEPTED");
  });

  it("returns nulls rather than guesses for an unparseable body", () => {
    expect(parseIcsReply("not a calendar at all")).toEqual({
      proposalId: null, token: null, partstat: null, attendeeEmail: null,
    });
  });

  it("refuses a PARTSTAT it does not recognise", () => {
    expect(parseIcsReply(reply.replace("PARTSTAT=ACCEPTED", "PARTSTAT=MAYBE-LATER")).partstat).toBeNull();
  });

  it("ignores a UID that is not one of ours", () => {
    expect(parseIcsReply(reply.replace("@grimoire", "@evil.example")).proposalId).toBeNull();
  });
});

describe("availabilityFromPartstat", () => {
  it("maps the two answers the app can hold", () => {
    expect(availabilityFromPartstat("ACCEPTED")).toBe(true);
    expect(availabilityFromPartstat("DECLINED")).toBe(false);
  });

  it("records nothing for a maybe — the app has no third state to put it in", () => {
    expect(availabilityFromPartstat("TENTATIVE")).toBeNull();
    expect(availabilityFromPartstat("NEEDS-ACTION")).toBeNull();
    expect(availabilityFromPartstat("DELEGATED")).toBeNull();
    expect(availabilityFromPartstat(null)).toBeNull();
  });
});
