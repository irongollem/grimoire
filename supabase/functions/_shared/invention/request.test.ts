import { describe, it, expect } from "vitest";
import { benchRowIds, parseInventRequest, parseModelAnswer, readContext, repairSuffix, sumUsage } from "./request.ts";

const PM = "11111111-1111-4111-8111-111111111111";
const R1 = "22222222-2222-4222-8222-222222222222";

describe("parseInventRequest", () => {
  it("accepts a materials request", () => {
    const r = parseInventRequest({ action: "materials", party_member_id: PM, discipline: "tinkering", row_ids: [R1, R1] });
    expect(r).toEqual({ ok: true, request: { action: "materials", party_member_id: PM, discipline: "tinkering", row_ids: [R1, R1] } });
  });
  it("refuses an empty bench in materials mode", () => {
    expect(parseInventRequest({ action: "materials", party_member_id: PM, discipline: "tinkering", row_ids: [] }).ok).toBe(false);
    expect(parseInventRequest({ action: "materials", party_member_id: PM, discipline: "tinkering" }).ok).toBe(false);
  });
  it("allows exactly eight dishes", () => {
    expect(parseInventRequest({ action: "materials", party_member_id: PM, discipline: "tinkering", row_ids: Array(8).fill(R1) }).ok).toBe(true);
  });
  it("refuses a request that names no valid character or invention", () => {
    expect(parseInventRequest({ action: "materials", party_member_id: "nope", discipline: "tinkering", row_ids: [R1] }).ok).toBe(false);
    expect(parseInventRequest({ action: "idea", party_member_id: undefined, discipline: "cooking", wish: "a pie" }).ok).toBe(false);
    expect(parseInventRequest({ action: "revise", invention_id: "nope", note: "cheaper" }).ok).toBe(false);
  });
  it("refuses more than eight dishes and bad ids", () => {
    expect(parseInventRequest({ action: "materials", party_member_id: PM, discipline: "tinkering", row_ids: Array(9).fill(R1) }).ok).toBe(false);
    expect(parseInventRequest({ action: "materials", party_member_id: PM, discipline: "tinkering", row_ids: ["x"] }).ok).toBe(false);
  });
  it("refuses an unknown discipline", () => {
    expect(parseInventRequest({ action: "materials", party_member_id: PM, discipline: "necromancy", row_ids: [R1] }).ok).toBe(false);
  });
  it("trims the wish and allows an idea with no bench", () => {
    const r = parseInventRequest({ action: "idea", party_member_id: PM, discipline: "cooking", wish: "  a pie  " });
    expect(r).toEqual({ ok: true, request: { action: "idea", party_member_id: PM, discipline: "cooking", wish: "a pie", row_ids: [] } });
  });
  it("bounds the wish at 1000 and the note at 500", () => {
    expect(parseInventRequest({ action: "idea", party_member_id: PM, discipline: "cooking", wish: "   " }).ok).toBe(false);
    expect(parseInventRequest({ action: "idea", party_member_id: PM, discipline: "cooking", wish: "a".repeat(1001) }).ok).toBe(false);
    expect(parseInventRequest({ action: "idea", party_member_id: PM, discipline: "cooking", wish: "a".repeat(1000) }).ok).toBe(true);
    expect(parseInventRequest({ action: "revise", invention_id: PM, note: "a".repeat(501) }).ok).toBe(false);
    expect(parseInventRequest({ action: "revise", invention_id: PM, note: " cheaper " })).toEqual({
      ok: true,
      request: { action: "revise", invention_id: PM, note: "cheaper" },
    });
  });
  it("refuses non-objects and unknown actions", () => {
    expect(parseInventRequest(null).ok).toBe(false);
    expect(parseInventRequest([]).ok).toBe(false);
    expect(parseInventRequest({ action: "delete" }).ok).toBe(false);
  });
});

describe("helpers", () => {
  it("repeats a bench row once per dish", () => {
    expect(benchRowIds([{ row_id: "a", dishes: 2 }, { row_id: "b", dishes: 1 }])).toEqual(["a", "a", "b"]);
  });
  it("reads the context, including a numeric string multiple", () => {
    expect(readContext({ campaign_id: "c", value_multiple: "2.5", bench: [] })).toEqual({ campaign_id: "c", value_multiple: 2.5, bench: [] });
    expect(readContext({ campaign_id: "c", value_multiple: 0, bench: [] })).toBeNull();
    expect(readContext({ campaign_id: "c", value_multiple: 2 })).toBeNull();
    expect(readContext(null)).toBeNull();
  });
  it("reports malformed model output", () => {
    expect(parseModelAnswer("{\"a\":1}")).toEqual({ ok: true, value: { a: 1 } });
    expect(parseModelAnswer("not json")).toEqual({ ok: false });
  });
  it("builds the repair text", () => {
    const t = repairSuffix("{}", ["Too strong."]);
    expect(t).toContain("- Too strong.");
    expect(t).toContain("Return a corrected JSON object.");
  });
  it("sums usage across calls", () => {
    const u = sumUsage([
      { model: "m", provider: "p", input_tokens: 10, output_tokens: 5 },
      { model: "m2", provider: "p", input_tokens: 20, output_tokens: 7 },
    ]);
    expect(u).toEqual({ model: "m2", provider: "p", input_tokens: 30, output_tokens: 12 });
  });
});
