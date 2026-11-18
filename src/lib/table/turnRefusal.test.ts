import { describe, expect, it } from "vitest";
import { NO_ANSWER, refusalFailure, WITHHELD } from "./turnRefusal";

describe("refusalFailure", () => {
  // Bug caught: a 402 shown as a generic failure with "Send again", which fails the same way every time.
  it("offers credits, not a retry, when the balance cannot cover a turn", () => {
    expect(refusalFailure(402, "insufficient_credits")).toMatchObject({ action: "credits" });
    expect(refusalFailure(402, "insufficient_credits").message).toMatch(/out of credits/i);
  });

  // Bug caught: a flagged message offered "Send again", resending the same refused words.
  it("tells the player to reword a message the check stopped, with no retry", () => {
    const failure = refusalFailure(400, "Message was flagged");
    expect(failure.action).toBe("none");
    expect(failure.message).toMatch(/reword/i);
  });

  it.each([
    [429, "rate_limited"],
    [503, "The AI table cannot be metered right now."],
  ])("lets the player send again after a %s", (status, code) => {
    expect(refusalFailure(status, code).action).toBe("resend");
  });

  // Bug caught: the server's own wording (written for logs and other developers) shown to the player.
  it("never shows the server's wording", () => {
    expect(refusalFailure(503, "The AI table cannot be metered right now.").message).not.toContain("metered");
    expect(refusalFailure(404, "Place not found.").message).not.toContain("Place not found");
  });

  // Bug caught: a child account told "AI must be on", which is not what is wrong.
  it("says a child account is not seated, apart from the general 403", () => {
    expect(refusalFailure(403, "child_account").message).toMatch(/child/i);
    expect(refusalFailure(403, "account_suspended").message).not.toMatch(/child/i);
  });

  // Bug caught: an account the table is closed to told "AI must be on for the campaign", which sends them to a
  // setting that is not what is wrong.
  it("says the table is closed to the account, apart from the general 403", () => {
    const failure = refusalFailure(403, "table_closed");
    expect(failure.message).toMatch(/closed to this account/i);
    expect(failure.action).toBe("none");
  });

  // Bug caught: a withheld answer offered "Send again", which sends the same thing and is withheld again.
  it("offers no retry for an answer that was withheld", () => {
    expect(WITHHELD.action).toBe("none");
    expect(WITHHELD.message).toMatch(/nothing was charged/i);
  });

  it("offers a retry when the Narrator did not answer", () => {
    expect(NO_ANSWER.action).toBe("resend");
    expect(NO_ANSWER.message).toMatch(/nothing was charged/i);
  });
});
