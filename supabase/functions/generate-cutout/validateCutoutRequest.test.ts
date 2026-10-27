import { describe, expect, it } from "vitest";
import { validateCutoutRequest } from "./validateCutoutRequest";

describe("validateCutoutRequest", () => {
  it.each(["monsters", "npcs"])("accepts a well-formed %s request and drops extra fields", (table) => {
    const result = validateCutoutRequest({ campaign_id: "c1", table, id: "x1", image_url: "https://evil.test/a.png" });
    expect(result).toEqual({ ok: true, request: { campaign_id: "c1", table, id: "x1" } });
  });

  it.each([null, undefined, "string", 42, []])("rejects a non-object body (%p)", (body) => {
    expect(validateCutoutRequest(body)).toEqual({ ok: false, error: "invalid_body" });
  });

  it.each([
    ["no campaign_id", { table: "monsters", id: "m1" }],
    ["empty campaign_id", { campaign_id: "", table: "monsters", id: "m1" }],
    ["non-string campaign_id", { campaign_id: 7, table: "monsters", id: "m1" }],
    ["no id", { campaign_id: "c1", table: "monsters" }],
    ["empty id", { campaign_id: "c1", table: "monsters", id: "" }],
  ])("rejects %s", (_label, body) => {
    expect(validateCutoutRequest(body)).toEqual({ ok: false, error: "invalid_body" });
  });

  // The table name becomes a query target, so only the two allowlisted names pass.
  it.each([undefined, "items", "MONSTERS", "monsters ", "users", 123, ["monsters"]])(
    "rejects the table %j",
    (table) => {
      expect(validateCutoutRequest({ campaign_id: "c1", table, id: "m1" })).toEqual({ ok: false, error: "invalid_table" });
    },
  );
});
