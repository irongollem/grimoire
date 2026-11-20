import { describe, expect, it } from "vitest";
import { DOLL_FALLBACK_ERROR, dollErrorMessage, readDollFailure } from "./characterDollErrors";

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
    const sentences = CODES.map((c) => dollErrorMessage(c));
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

describe("readDollFailure", () => {
  const failure = (body: unknown) => ({ message: "non-2xx", context: new Response(JSON.stringify(body), { status: 403 }) });

  it("reads the code from the body, because the shared refusals put a sentence in `message` that edgeErrorMessage shows", async () => {
    const { code, sentence } = await readDollFailure(failure({ error: "ai_disabled", message: "AI is turned off for this campaign." }));
    expect(sentence).toBe("AI is turned off for this campaign.");
    expect(code).toBe("ai_disabled");
    // The sentence alone is not a code the doll knows; the code is what gives the player its own wording.
    expect(dollErrorMessage(sentence)).toBe(DOLL_FALLBACK_ERROR);
    expect(dollErrorMessage(sentence, code)).toBe("Your DM has turned AI off for this table.");
  });

  it("has no code when the response had no JSON body", async () => {
    const { code } = await readDollFailure({ message: "network down", context: new Response("<html>") });
    expect(code).toBeNull();
  });
});
