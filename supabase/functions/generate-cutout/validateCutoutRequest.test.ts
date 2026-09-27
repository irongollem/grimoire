import { describe, expect, it } from "vitest";
import { validateCutoutRequest } from "./validateCutoutRequest";

describe("validateCutoutRequest", () => {
  it("accepts a well-formed monsters request", () => {
    const result = validateCutoutRequest({ campaign_id: "c1", table: "monsters", id: "m1" });
    expect(result).toEqual({ ok: true, request: { campaign_id: "c1", table: "monsters", id: "m1" } });
  });

  it("accepts a well-formed npcs request", () => {
    const result = validateCutoutRequest({ campaign_id: "c1", table: "npcs", id: "n1" });
    expect(result).toEqual({ ok: true, request: { campaign_id: "c1", table: "npcs", id: "n1" } });
  });

  it.each([null, undefined, "string", 42, []])("rejects a non-object body (%p)", (body) => {
    expect(validateCutoutRequest(body)).toEqual({ ok: false, error: "invalid_body" });
  });

  it("rejects a missing campaign_id", () => {
    expect(validateCutoutRequest({ table: "monsters", id: "m1" })).toEqual({ ok: false, error: "invalid_body" });
  });

  it("rejects an empty campaign_id", () => {
    expect(validateCutoutRequest({ campaign_id: "", table: "monsters", id: "m1" })).toEqual({
      ok: false,
      error: "invalid_body",
    });
  });

  it("rejects a missing id", () => {
    expect(validateCutoutRequest({ campaign_id: "c1", table: "monsters" })).toEqual({
      ok: false,
      error: "invalid_body",
    });
  });

  it("rejects a missing table", () => {
    expect(validateCutoutRequest({ campaign_id: "c1", id: "m1" })).toEqual({ ok: false, error: "invalid_table" });
  });

  it("rejects a table outside the allowlist — never a source of arbitrary reads", () => {
    expect(validateCutoutRequest({ campaign_id: "c1", table: "items", id: "i1" })).toEqual({
      ok: false,
      error: "invalid_table",
    });
  });

  it("rejects a non-string table", () => {
    expect(validateCutoutRequest({ campaign_id: "c1", table: 123, id: "m1" })).toEqual({
      ok: false,
      error: "invalid_table",
    });
  });
});
