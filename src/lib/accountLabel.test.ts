import { describe, it, expect } from "vitest";
import { accountLabel, isUnsafeAccountEmail } from "./accountLabel";

describe("isUnsafeAccountEmail", () => {
  it("is false for a real address", () => {
    expect(isUnsafeAccountEmail("wizard@example.com")).toBe(false);
  });

  it("is true for a child account's internal marker address", () => {
    expect(isUnsafeAccountEmail("robin-the-brave@players.dungeongrimoire.invalid")).toBe(true);
  });

  it("is false for null/undefined/empty", () => {
    expect(isUnsafeAccountEmail(null)).toBe(false);
    expect(isUnsafeAccountEmail(undefined)).toBe(false);
    expect(isUnsafeAccountEmail("")).toBe(false);
  });
});

describe("accountLabel", () => {
  it("prefers the display name", () => {
    expect(
      accountLabel({ displayName: "Shadowmere", username: "shadow", email: "wizard@example.com" }),
    ).toBe("Shadowmere");
  });

  it("falls back to the profile username when there's no display name", () => {
    expect(accountLabel({ displayName: null, username: "shadow", email: "wizard@example.com" })).toBe("shadow");
  });

  it("falls back to the real email when there's neither name nor username", () => {
    expect(accountLabel({ displayName: null, username: null, email: "wizard@example.com" })).toBe(
      "wizard@example.com",
    );
  });

  it("treats a blank display name and username as absent", () => {
    expect(accountLabel({ displayName: "  ", username: "  ", email: "wizard@example.com" })).toBe(
      "wizard@example.com",
    );
  });

  it("never returns a child account's internal marker email, even with no name set", () => {
    expect(
      accountLabel({
        displayName: null,
        username: null,
        email: "robin-the-brave@players.dungeongrimoire.invalid",
        childLoginName: "robin-the-brave",
      }),
    ).toBe("robin-the-brave");
  });

  it("prefers a display name over the child login-name fallback", () => {
    expect(
      accountLabel({
        displayName: "Robin",
        username: null,
        email: "robin-the-brave@players.dungeongrimoire.invalid",
        childLoginName: "robin-the-brave",
      }),
    ).toBe("Robin");
  });

  it("returns an empty string when nothing safe is available", () => {
    expect(
      accountLabel({
        displayName: null,
        username: null,
        email: "robin-the-brave@players.dungeongrimoire.invalid",
        childLoginName: null,
      }),
    ).toBe("");
  });
});
