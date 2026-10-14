import { describe, expect, it } from "vitest";
import { formatNoticeDate, inactivityNoticeEmail } from "./inactivityNotice";

const base = { lastActiveAt: "2025-09-20T08:00:00Z", deleteAfter: "2026-11-13T09:00:00Z" };

describe("formatNoticeDate", () => {
  it("renders a plain English date in UTC", () => {
    expect(formatNoticeDate("2026-11-13T23:30:00Z")).toBe("13 November 2026");
  });
});

describe("inactivityNoticeEmail", () => {
  const adult = inactivityNoticeEmail({ ...base, forParent: false });
  const parent = inactivityNoticeEmail({ ...base, forParent: true });

  it("has a subject that says what happens", () => {
    expect(adult.subject).toBe("Your Dungeon Grimoire account will be deleted unless you sign in");
    expect(parent.subject).toBe(adult.subject);
  });

  it("renders last seen month and the deadline in both bodies", () => {
    for (const mail of [adult, parent]) {
      for (const body of [mail.html, mail.text]) {
        expect(body).toContain("September 2025");
        expect(body).toContain("13 November 2026");
        expect(body).toContain("https://app.dungeongrimoire.com");
        expect(body).toContain("export it first");
      }
    }
  });

  it("addresses the adult directly and the parent about the young player", () => {
    expect(adult.text).toContain("We have not seen you");
    expect(adult.text).not.toContain("young player");
    expect(parent.text).toContain("the account you set up for your young player");
    expect(parent.html).toContain("young player");
  });

  it("uses no em-dashes", () => {
    for (const mail of [adult, parent]) {
      expect(mail.subject + mail.html + mail.text).not.toContain("—");
    }
  });

  it("escapes interpolated dates in html", () => {
    const mail = inactivityNoticeEmail({ ...base, deleteAfter: "2026-11-13T09:00:00Z", forParent: false });
    expect(mail.html).not.toMatch(/<script/i);
    expect(mail.html).toContain("13 November 2026");
  });
});
