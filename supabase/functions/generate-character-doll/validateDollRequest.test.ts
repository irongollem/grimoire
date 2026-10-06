import { describe, expect, it } from "vitest";
import { validateDollRequest } from "./validateDollRequest";

describe("validateDollRequest", () => {
  it("accepts a well-formed request", () => {
    expect(validateDollRequest({ party_member_id: "pm1" })).toEqual({
      ok: true,
      request: { party_member_id: "pm1" },
    });
  });

  it.each([null, undefined, "string", 42, []])("rejects a non-object body (%p)", (body) => {
    expect(validateDollRequest(body)).toEqual({ ok: false, error: "invalid_body" });
  });

  it("rejects a missing party_member_id", () => {
    expect(validateDollRequest({})).toEqual({ ok: false, error: "invalid_body" });
  });

  it("rejects an empty party_member_id", () => {
    expect(validateDollRequest({ party_member_id: "" })).toEqual({ ok: false, error: "invalid_body" });
  });

  it("rejects a non-string party_member_id", () => {
    expect(validateDollRequest({ party_member_id: 7 })).toEqual({ ok: false, error: "invalid_body" });
  });
});
