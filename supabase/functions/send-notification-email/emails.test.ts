import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  formatProposalDate,
  noteSharedEmail,
  proposalCreatedEmail,
} from "./emails";

describe("escapeHtml", () => {
  it("escapes all HTML-significant characters", () => {
    expect(escapeHtml(`<img src=x onerror="alert('1')" & more>`)).toBe(
      "&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot; &amp; more&gt;",
    );
  });
});

describe("formatProposalDate", () => {
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

describe("noteSharedEmail", () => {
  const email = noteSharedEmail({
    campaignName: "Curse of <Strahd>",
    dmName: "Jeffrey & co",
    noteTitle: 'Session 12: "The Amber Temple"',
    noteId: "11111111-2222-3333-4444-555555555555",
  });

  it("names the DM and note in the subject", () => {
    expect(email.subject).toBe(
      "Jeffrey & co shared a session note with you — Curse of <Strahd>",
    );
  });

  it("escapes user content in the HTML body", () => {
    expect(email.html).toContain("Curse of &lt;Strahd&gt;");
    expect(email.html).toContain("Jeffrey &amp; co");
    expect(email.html).toContain("&quot;The Amber Temple&quot;");
    expect(email.html).not.toContain("<Strahd>");
  });

  it("deep-links the exact note on the DM Notes tab, plus the opt-out settings page", () => {
    const deepLink =
      "https://app.dungeongrimoire.com/play/journal?tab=dm-notes&note=11111111-2222-3333-4444-555555555555";
    expect(email.html).toContain(deepLink);
    expect(email.text).toContain(deepLink);
    expect(email.text).toContain("https://app.dungeongrimoire.com/play/settings");
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

  it("ships without RSVP links when no token could be issued", () => {
    // The degraded path is the one that must not break: a failure to mint
    // tokens still gets the party the mail, minus the buttons.
    expect(email.html).not.toContain("I&#39;m in");
    expect(email.html).toContain("Let your DM know whether you can make it.");
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

  it("offers both answers in HTML and in plain text", () => {
    expect(withRsvp.html).toContain("answer=yes");
    expect(withRsvp.html).toContain("answer=no");
    // The plain-text part matters more than usual here: the readers this
    // feature exists for are the ones whose client renders nothing clever.
    expect(withRsvp.text).toContain("I'm in: https://edge.example");
    expect(withRsvp.text).toContain("Can't make it: https://edge.example");
  });

  it("points at the invitation as the other way to answer", () => {
    expect(withRsvp.html).toContain("accept the invitation attached");
  });
});
