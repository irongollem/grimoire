import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  adultOn,
  CHILD_LOGIN_DOMAIN,
  childLoginEmail,
  isChildLoginEmail,
  isUnderAdultAge,
  isValidBirthMonth,
  isValidLoginName,
  LOGIN_NAME_PATTERN,
  signInEmail,
} from "./childAccount";

describe("adultOn", () => {
  it("is the first of the month after the 16th birthday month", () => {
    expect(adultOn({ month: 3, year: 2011 })).toBe("2027-04-01");
  });

  it("rolls December into the next year", () => {
    expect(adultOn({ month: 12, year: 2010 })).toBe("2027-01-01");
  });
});

describe("isUnderAdultAge", () => {
  const today = new Date("2026-09-28T12:00:00Z");

  it("counts someone who turns 16 this month as still under 16", () => {
    // Born Sep 2010: may already be 16, may not. The month is all we ask, so
    // the answer errs on the side of the parent.
    expect(isUnderAdultAge({ month: 9, year: 2010 }, today)).toBe(true);
  });

  it("counts someone who turned 16 last month as 16", () => {
    expect(isUnderAdultAge({ month: 8, year: 2010 }, today)).toBe(false);
  });

  it("counts an adult as an adult", () => {
    expect(isUnderAdultAge({ month: 1, year: 1985 }, today)).toBe(false);
  });

  it("counts a young child as a child", () => {
    expect(isUnderAdultAge({ month: 6, year: 2017 }, today)).toBe(true);
  });
});

describe("isValidBirthMonth", () => {
  const today = new Date("2026-09-28T12:00:00Z");

  it("accepts a past month", () => {
    expect(isValidBirthMonth({ month: 9, year: 2026 }, today)).toBe(true);
  });

  it("refuses a future month", () => {
    expect(isValidBirthMonth({ month: 10, year: 2026 }, today)).toBe(false);
  });

  it("refuses a month out of range and an implausible year", () => {
    expect(isValidBirthMonth({ month: 13, year: 2000 }, today)).toBe(false);
    expect(isValidBirthMonth({ month: 1, year: 1800 }, today)).toBe(false);
  });
});

describe("login names", () => {
  it("accepts lowercase names with digits and hyphens", () => {
    expect(isValidLoginName("mira-7")).toBe(true);
    expect(isValidLoginName("  Mira  ")).toBe(true);
  });

  it("refuses names too short, too long, or starting with a hyphen", () => {
    expect(isValidLoginName("ab")).toBe(false);
    expect(isValidLoginName("a".repeat(31))).toBe(false);
    expect(isValidLoginName("-mira")).toBe(false);
    expect(isValidLoginName("mira dragon")).toBe(false);
  });

  it("maps to an address on the reserved domain", () => {
    expect(childLoginEmail(" Mira ")).toBe(`mira@${CHILD_LOGIN_DOMAIN}`);
    expect(isChildLoginEmail(`MIRA@${CHILD_LOGIN_DOMAIN.toUpperCase()}`)).toBe(true);
    expect(isChildLoginEmail("parent@example.com")).toBe(false);
  });

  it("reads the sign-in field as an email when it has an @, a login name otherwise", () => {
    expect(signInEmail(" parent@example.com ")).toBe("parent@example.com");
    expect(signInEmail("Mira")).toBe(`mira@${CHILD_LOGIN_DOMAIN}`);
  });

  it("uses the reserved .invalid TLD, which can never deliver mail", () => {
    expect(CHILD_LOGIN_DOMAIN.endsWith(".invalid")).toBe(true);
  });

  it("matches the child_accounts.login_name check constraint", () => {
    const sql = readFileSync(
      join(__dirname, "../../migrations/20260928053257_child_accounts.sql"),
      "utf8",
    );
    const constraint = sql.match(/check \(login_name ~ '([^']+)'\)/);
    expect(constraint?.[1]).toBe(LOGIN_NAME_PATTERN.source);
  });
});
