import { describe, expect, it } from "vitest";
import { childAccountErrorMessage, childFormErrors, formatAdultOn, type ChildFormState } from "./useFamily";

describe("formatAdultOn", () => {
  it("renders a YYYY-MM-DD adult_on date as Month YYYY", () => {
    expect(formatAdultOn("2038-10-01")).toBe("October 2038");
  });

  it("pads no leading zero into the month name lookup", () => {
    expect(formatAdultOn("2030-01-01")).toBe("January 2030");
    expect(formatAdultOn("2030-12-01")).toBe("December 2030");
  });
});

describe("childAccountErrorMessage", () => {
  it("maps a known edge function error code to human copy", () => {
    expect(childAccountErrorMessage("login_name_taken")).toBe(
      "That login name is already taken. Try another.",
    );
  });

  it("explains why an account that is not a verified adult cannot add a young player", () => {
    expect(childAccountErrorMessage("awaiting_parent")).toContain("waiting for its own parent");
    expect(childAccountErrorMessage("terms_not_accepted")).toContain("Accept the updated Terms");
  });

  it("passes an unrecognised code through verbatim", () => {
    expect(childAccountErrorMessage("some_new_code")).toBe("some_new_code");
  });

  it("never includes an em-dash", () => {
    for (const message of Object.values({
      a: childAccountErrorMessage("child_account"),
      b: childAccountErrorMessage("request_not_found"),
      c: childAccountErrorMessage("wrong_parent"),
    })) {
      expect(message).not.toContain("—");
    }
  });
});

describe("childFormErrors", () => {
  const today = new Date("2026-09-28T00:00:00Z");

  function validForm(): ChildFormState {
    return {
      displayName: "Robin",
      loginName: "robin-the-brave",
      password: "correcthorse",
      confirmPassword: "correcthorse",
      birthMonth: 5,
      birthYear: 2015,
      consented: true,
    };
  }

  it("has no errors for a fully valid form", () => {
    expect(childFormErrors(validForm(), today)).toEqual([]);
  });

  it("flags a login name that doesn't match the pattern", () => {
    const errors = childFormErrors({ ...validForm(), loginName: "Ab" }, today);
    expect(errors).toContain("Login name must be 3 to 30 lowercase letters, numbers or hyphens.");
  });

  it("flags a password under 8 characters", () => {
    const errors = childFormErrors(
      { ...validForm(), password: "short", confirmPassword: "short" },
      today,
    );
    expect(errors).toContain("Password must be at least 8 characters.");
  });

  it("flags mismatched password confirmation", () => {
    const errors = childFormErrors({ ...validForm(), confirmPassword: "somethingElse1" }, today);
    expect(errors).toContain("Passwords don't match.");
  });

  it("flags a birth month that makes the child 16 or older", () => {
    const errors = childFormErrors({ ...validForm(), birthMonth: 1, birthYear: 2000 }, today);
    expect(errors.some((e) => e.includes("16 or older"))).toBe(true);
  });

  it("flags an implausible birth month", () => {
    const errors = childFormErrors({ ...validForm(), birthMonth: 13, birthYear: 2015 }, today);
    expect(errors).toContain("Enter a valid birth month and year.");
  });

  it("flags a birth month/year that hasn't been chosen yet, without coercing to a fake date", () => {
    const errors = childFormErrors({ ...validForm(), birthMonth: null, birthYear: null }, today);
    expect(errors).toContain("Choose a birth month and year.");
    expect(errors).not.toContain("Enter a valid birth month and year.");
  });

  it("flags a missing display name", () => {
    const errors = childFormErrors({ ...validForm(), displayName: "  " }, today);
    expect(errors).toContain("Enter a display name.");
  });

  it("flags an unticked consent box", () => {
    const errors = childFormErrors({ ...validForm(), consented: false }, today);
    expect(errors).toContain("Tick the consent box to continue.");
  });

  it("accumulates every violated rule at once", () => {
    const errors = childFormErrors(
      {
        displayName: "",
        loginName: "x",
        password: "a",
        confirmPassword: "b",
        birthMonth: 1,
        birthYear: 1990,
        consented: false,
      },
      today,
    );
    expect(errors.length).toBeGreaterThan(3);
  });
});
