import { afterEach, describe, it, expect } from "vitest";
import {
  formatProposalDate,
  proposalCreatedEmail,
} from "./emails";

describe("formatProposalDate", () => {
  const zone = process.env.TZ;
  afterEach(() => {
    if (zone === undefined) delete process.env.TZ;
    else process.env.TZ = zone;
  });

  it("does not shift the day for a reader west of UTC: a wall-clock date has no timezone", () => {
    process.env.TZ = "America/Los_Angeles"; // UTC-7 in August: local-time parsing would say August 4
    expect(formatProposalDate("2026-08-05", null)).toBe("Wednesday, August 5, 2026");
  });

  it("formats a date-only proposal in UTC, unshifted", () => {
    expect(formatProposalDate("2026-08-05", null)).toBe("Wednesday, August 5, 2026");
  });

  it("appends the time and trims Postgres seconds", () => {
    expect(formatProposalDate("2026-08-05", "19:30:00")).toBe(
      "Wednesday, August 5, 2026 at 19:30",
    );
    expect(formatProposalDate("2026-08-05", "19:30")).toBe(
      "Wednesday, August 5, 2026 at 19:30",
    );
  });
});

describe("proposalCreatedEmail", () => {
  const email = proposalCreatedEmail({
    campaignName: "Tomb of Annihilation",
    dmName: "Jeffrey",
    proposalTitle: "Session 13",
    proposedDate: "2026-09-01",
    proposedTime: "19:00:00",
  });

  it("puts the formatted date in the body", () => {
    expect(email.html).toContain("Tuesday, September 1, 2026 at 19:00");
    expect(email.text).toContain("Tuesday, September 1, 2026 at 19:00");
  });

  it("links the availability page", () => {
    expect(email.html).toContain("https://app.dungeongrimoire.com/play/settings");
    expect(email.text).toContain("https://app.dungeongrimoire.com/play/settings");
  });

  it("escapes everything a user typed in the html and leaves the plain text raw", () => {
    const hostile = proposalCreatedEmail({
      campaignName: "<img src=x onerror=alert(1)>",
      dmName: "Jeff <b>rey</b>",
      proposalTitle: `Session "13" & more`,
      proposedDate: "2026-09-01",
      proposedTime: null,
    });
    expect(hostile.html).not.toContain("<img");
    expect(hostile.html).not.toContain("<b>rey");
    expect(hostile.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(hostile.html).toContain("Session &quot;13&quot; &amp; more");
    expect(hostile.text).toContain(`Session "13" & more`);
  });

  it("ships without RSVP links when no token could be issued", () => {
    // The degraded path is the one that must not break: a failure to mint
    // tokens still gets the party the mail, minus the buttons.
    expect(email.html).not.toContain("session-rsvp");
    expect(email.text).not.toContain("session-rsvp");
  });

  const withRsvp = proposalCreatedEmail({
    campaignName: "Tomb of Annihilation",
    dmName: "Jeffrey",
    proposalTitle: "Session 13",
    proposedDate: "2026-09-01",
    proposedTime: "19:00:00",
    rsvp: {
      yesUrl: "https://edge.example/functions/v1/session-rsvp?token=t&answer=yes",
      noUrl: "https://edge.example/functions/v1/session-rsvp?token=t&answer=no",
    },
  });

  it("offers both answers in HTML and in plain text, and escapes the links' ampersands in the html", () => {
    expect(withRsvp.html).toContain("token=t&amp;answer=yes");
    expect(withRsvp.html).toContain("token=t&amp;answer=no");
    // The plain-text part matters more than usual here: the readers this
    // feature exists for are the ones whose client renders nothing clever.
    expect(withRsvp.text).toContain("https://edge.example/functions/v1/session-rsvp?token=t&answer=yes");
    expect(withRsvp.text).toContain("https://edge.example/functions/v1/session-rsvp?token=t&answer=no");
  });

  it("cannot be broken out of the href by a hostile RSVP url", () => {
    const evil = proposalCreatedEmail({
      campaignName: "C",
      dmName: "D",
      proposalTitle: "T",
      proposedDate: "2026-09-01",
      proposedTime: null,
      rsvp: { yesUrl: 'https://x.test/"><script>1</script>', noUrl: "https://x.test/no" },
    });
    expect(evil.html).not.toContain("<script>");
  });
});
