import { describe, expect, it } from "vitest";
import { DOLL_FALLBACK_ERROR, dollErrorMessage } from "./characterDollErrors";

describe("dollErrorMessage", () => {
  const CODES = [
    "no_portrait",
    "doll_in_progress",
    "ai_disabled",
    "forbidden",
    "no_campaign",
    "likeness_acknowledgement_required",
    "not_found",
  ];

  it("gives every known code its own sentence, never the generic fallback", () => {
    const sentences = CODES.map(dollErrorMessage);
    expect(sentences).not.toContain(DOLL_FALLBACK_ERROR);
    expect(new Set(sentences).size).toBe(CODES.length);
  });

  it("reads a code with stray whitespace the same as the bare code", () => {
    expect(dollErrorMessage("  no_portrait \n")).toBe(dollErrorMessage("no_portrait"));
  });

  it.each([
    "The image was refused by content screening: nope",
    "Insufficient credits for this doll",
    "You are generating too fast",
    "Your account is frozen",
    "Dolls aren't available on this plan",
  ])("keeps the server's own wording for a refusal, credit or rate message: %s", (refusal) => {
    expect(dollErrorMessage(refusal)).toBe(refusal);
  });

  it("falls back for anything it does not know", () => {
    expect(dollErrorMessage("Edge Function returned a non-2xx status code")).toBe(DOLL_FALLBACK_ERROR);
    expect(dollErrorMessage("")).toBe(DOLL_FALLBACK_ERROR);
  });
});
