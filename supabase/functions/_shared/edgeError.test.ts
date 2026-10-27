import { describe, expect, it } from "vitest";
import { edgeErrorMessage } from "./edgeError.ts";

const withBody = (body: unknown) => ({
  message: "Edge Function returned a non-2xx status code",
  context: new Response(JSON.stringify(body)),
});

describe("edgeErrorMessage", () => {
  it("turns a checkout 500 into something a buyer can act on (#905)", async () => {
    for (const code of ["checkout_failed", "Internal server error"]) {
      expect(await edgeErrorMessage(withBody({ error: code }))).toMatch(/couldn't open the payment page/);
    }
  });

  it("names the subscription and consent refusals in words", async () => {
    expect(await edgeErrorMessage(withBody({ error: "already_subscribed" }))).toMatch(/Manage billing/);
    expect(await edgeErrorMessage(withBody({ error: "withdrawal_consent_required" }))).toMatch(/withdrawal-waiver/);
  });

  it("says how many credits are left, including none at all", async () => {
    expect(await edgeErrorMessage(withBody({ error: "insufficient_credits", balance: 0 }))).toMatch(/\(0 left\)/);
    expect(await edgeErrorMessage(withBody({ error: "insufficient_credits" }))).not.toMatch(/left/);
  });

  it("shows a long plain-text body as the client message rather than a wall of text", async () => {
    const wall = "x".repeat(201);
    expect(
      await edgeErrorMessage({ message: "Failed to fetch", context: new Response(wall) }),
    ).toBe("Failed to fetch");
    expect(
      await edgeErrorMessage({ message: "Failed to fetch", context: new Response("y".repeat(200)) }),
    ).toBe("y".repeat(200));
  });

  it("shows a short plain-text reason as it is", async () => {
    expect(
      await edgeErrorMessage({ message: "Edge Function returned a non-2xx status code", context: new Response("Campaign not found") }),
    ).toBe("Campaign not found");
  });

  it("falls back to the client message when the body is not JSON", async () => {
    expect(
      await edgeErrorMessage({ message: "Failed to fetch", context: new Response("<html>") }),
    ).toBe("Failed to fetch");
  });
});
