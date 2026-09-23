import { describe, expect, it } from "vitest";
import { edgeErrorMessage } from "./edgeError";

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

  it("falls back to the client message when the body is not JSON", async () => {
    expect(
      await edgeErrorMessage({ message: "Failed to fetch", context: new Response("<html>") }),
    ).toBe("Failed to fetch");
  });
});
