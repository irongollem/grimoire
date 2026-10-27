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

  it("discards any extra field the client sends", () => {
    expect(validateDollRequest({ party_member_id: "pm1", user_id: "someone-else", prompt: "x" })).toEqual({
      ok: true,
      request: { party_member_id: "pm1" },
    });
  });

  it.each([{}, { party_member_id: "" }, { party_member_id: 7 }, { party_member_id: null }])(
    "rejects a missing, empty or non-string party_member_id (%j)",
    (body) => {
      expect(validateDollRequest(body)).toEqual({ ok: false, error: "invalid_body" });
    },
  );
});
