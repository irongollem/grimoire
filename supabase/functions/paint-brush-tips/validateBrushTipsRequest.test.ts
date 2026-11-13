import { describe, expect, it } from "vitest";
import {
  BRUSH_DESCRIPTION_MAX,
  BRUSH_DESCRIPTION_MIN,
  brushTipsPrompt,
  validateBrushTipsRequest,
} from "./validateBrushTipsRequest";

const CAMPAIGN = "11111111-1111-4111-8111-111111111111";

describe("validateBrushTipsRequest", () => {
  // Bug: the painter's padding reached the prompt, or extra client fields were passed through.
  it("trims the description and drops fields it did not ask for", () => {
    expect(validateBrushTipsRequest({ campaign_id: CAMPAIGN, description: "  a wet sponge dab ", model: "x" })).toEqual({
      ok: true,
      request: { campaign_id: CAMPAIGN, description: "a wet sponge dab" },
    });
  });

  it.each([null, "x", 4, []])("rejects a non-object body (%p)", (body) => {
    expect(validateBrushTipsRequest(body)).toEqual({ ok: false, error: "invalid_body" });
  });

  // Bug: a campaign id that is not a uuid reached the database query.
  it("rejects a campaign id that is not a uuid", () => {
    expect(validateBrushTipsRequest({ campaign_id: "c1", description: "a dry brush" })).toEqual({ ok: false, error: "invalid_body" });
  });

  // Bug: an off-by-one let a two-letter description, or whitespace padding, count as long enough.
  it("enforces the lower bound on the trimmed text", () => {
    const short = (description: string) => validateBrushTipsRequest({ campaign_id: CAMPAIGN, description });
    expect(short("a".repeat(BRUSH_DESCRIPTION_MIN - 1))).toEqual({ ok: false, error: "invalid_description" });
    expect(short("   ab   ")).toEqual({ ok: false, error: "invalid_description" });
    expect(short("a".repeat(BRUSH_DESCRIPTION_MIN)).ok).toBe(true);
  });

  // Bug: an unbounded description let a caller push a whole essay into a paid prompt.
  it("enforces the upper bound", () => {
    const long = (n: number) => validateBrushTipsRequest({ campaign_id: CAMPAIGN, description: "a".repeat(n) });
    expect(long(BRUSH_DESCRIPTION_MAX).ok).toBe(true);
    expect(long(BRUSH_DESCRIPTION_MAX + 1)).toEqual({ ok: false, error: "invalid_description" });
  });

  it.each([undefined, 7, null, ["a dab"]])("rejects a description that is not a string (%p)", (description) => {
    expect(validateBrushTipsRequest({ campaign_id: CAMPAIGN, description })).toEqual({ ok: false, error: "invalid_description" });
  });
});

describe("brushTipsPrompt", () => {
  // Bug: the frame lost a constraint the client's cutting relies on (2x2, black on white, white gaps).
  it("holds the painter's words inside the fixed sheet frame", () => {
    const p = brushTipsPrompt("a wet sponge dab");
    expect(p).toContain("a wet sponge dab");
    for (const part of ["four separate single brush marks", "Pure black ink on a pure white", "2x2 grid", "white space", "No shading of the paper, no text, no frame"]) {
      expect(p).toContain(part);
    }
  });
});
