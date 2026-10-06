import { describe, expect, it } from "vitest";
import { DOLL_FALLBACK_ERROR, dollErrorMessage } from "./characterDollErrors";

describe("dollErrorMessage", () => {
  it("turns the function's codes into sentences", () => {
    expect(dollErrorMessage("no_portrait")).toBe("Add a portrait first: the doll is drawn from it.");
    expect(dollErrorMessage("doll_in_progress")).toBe("Your doll is already being drawn.");
    expect(dollErrorMessage("ai_disabled")).toBe("Your DM has turned AI off for this table.");
    expect(dollErrorMessage("forbidden")).toBe("Only the character's player or the campaign's DM can make its doll.");
    expect(dollErrorMessage("likeness_acknowledgement_required")).toBe("Confirm the likeness notice first, then try again.");
    expect(dollErrorMessage("not_found")).toBe("This character could not be found.");
  });

  it("keeps a screening refusal as the server wrote it", () => {
    const refusal = "The image was refused by content screening: nope";
    expect(dollErrorMessage(refusal)).toBe(refusal);
  });

  it("falls back for anything it does not know", () => {
    expect(dollErrorMessage("Edge Function returned a non-2xx status code")).toBe(DOLL_FALLBACK_ERROR);
    expect(dollErrorMessage("")).toBe(DOLL_FALLBACK_ERROR);
  });
});
