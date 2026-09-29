import { describe, expect, it } from "vitest";
import { functionErrorCode, functionErrorPayload, functionErrorText } from "./functionError.ts";

const failure = (body: string) => ({ message: "Edge Function returned a non-2xx status code", context: new Response(body) });

describe("functionError", () => {
  it("parses a JSON error body", async () => {
    expect(await functionErrorPayload(failure(JSON.stringify({ error: "rate_limited" })))).toEqual({ error: "rate_limited" });
  });

  it("gives the raw text for a plain-text body, and no payload", async () => {
    expect(await functionErrorText(failure("Campaign not found"))).toBe("Campaign not found");
    expect(await functionErrorPayload(failure("Campaign not found"))).toBeNull();
  });

  it("falls back to the client message when there is no body", async () => {
    expect(await functionErrorCode({ message: "Failed to fetch" })).toBe("Failed to fetch");
  });
});
