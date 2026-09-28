import { describe, it, expect } from "vitest";
import { parentRequestErrorMessage } from "./parentRequestErrors";

describe("parentRequestErrorMessage", () => {
  it("maps every documented request-parental-consent error code", () => {
    expect(parentRequestErrorMessage("invalid_email")).toBe("That doesn't look like a valid email address.");
    expect(parentRequestErrorMessage("same_as_account_email")).toContain("your own email");
    expect(parentRequestErrorMessage("already_child")).toContain("already linked");
    expect(parentRequestErrorMessage("send_failed")).toContain("try again");
  });

  it("falls back to a generic message for an unrecognised code", () => {
    expect(parentRequestErrorMessage("some_new_code")).toBe("Something went wrong. Please try again.");
  });
});
