import { describe, expect, it } from "vitest";
import { selectTermsNoticeRecipients, termsNoticeEmail } from "./termsNotice";

const NOW = new Date("2026-10-04T12:00:00Z");
const V = "2026-09-28";
const u = (id: string, email: string | null, banned_until: string | null = null) => ({
  id,
  email,
  banned_until,
});

describe("selectTermsNoticeRecipients", () => {
  it("skips no-email, child-login and currently banned users silently", () => {
    const users = [
      u("a", null),
      u("b", "kid@players.dungeongrimoire.invalid"),
      u("c", "c@example.com", "2027-01-01T00:00:00Z"),
      u("d", "d@example.com"),
    ];
    const r = selectTermsNoticeRecipients(users, new Map(), new Set(), V, NOW);
    expect(r.recipients.map((x) => x.id)).toEqual(["d"]);
    expect(r.alreadyAccepted).toBe(0);
    expect(r.alreadyNotified).toBe(0);
  });

  it("mails a user whose ban has expired", () => {
    const r = selectTermsNoticeRecipients(
      [u("a", "a@example.com", "2020-01-01T00:00:00Z")],
      new Map(),
      new Set(),
      V,
      NOW,
    );
    expect(r.recipients).toHaveLength(1);
  });

  it("counts accepted and notified separately, and mails the rest", () => {
    const users = [u("a", "a@x.com"), u("b", "b@x.com"), u("c", "c@x.com"), u("d", "d@x.com")];
    const accepted = new Map<string, string | null>([
      ["a", V],
      ["b", "2026-01-01"],
      ["c", null],
    ]);
    const r = selectTermsNoticeRecipients(users, accepted, new Set(["b"]), V, NOW);
    expect(r.alreadyAccepted).toBe(1);
    expect(r.alreadyNotified).toBe(1);
    expect(r.recipients.map((x) => x.id)).toEqual(["c", "d"]);
  });
});

describe("termsNoticeEmail", () => {
  const mail = termsNoticeEmail({ version: V, changes: ["Players under 16 <b>&</b>"] });

  it("has the fixed subject", () => {
    expect(mail.subject).toBe("Our Terms of Service have changed");
  });

  it("escapes the change list in html and keeps it raw in text", () => {
    expect(mail.html).toContain("Players under 16 &lt;b&gt;&amp;&lt;/b&gt;");
    expect(mail.html).not.toContain("<b>&</b>");
    expect(mail.text).toContain("- Players under 16 <b>&</b>");
  });

  it("links both documents and the app, and explains why it cannot be switched off", () => {
    for (const body of [mail.html, mail.text]) {
      expect(body).toContain("https://dungeongrimoire.com/terms");
      expect(body).toContain("https://dungeongrimoire.com/privacy");
      expect(body).toContain("https://app.dungeongrimoire.com");
      expect(body).toContain("cannot be switched off");
      expect(body).toContain("asked to accept them");
    }
  });

  it("uses no em-dashes", () => {
    expect(mail.html + mail.text).not.toContain("—");
  });

  it("omits the list when there are no changes", () => {
    const bare = termsNoticeEmail({ version: V, changes: [] });
    expect(bare.html).not.toContain("<ul");
    expect(bare.text).not.toContain("What's new");
  });
});
