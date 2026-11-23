import { describe, expect, it, vi } from "vitest";
import { REOPEN_QUESTION_PATCH, RESUME_FORCE_PATCH, answerEntry, answeredPatch, endForce, endForcePatch, forceOutcome } from "./canonClose";
import { canonEntry } from "@/test/canonEntry";

describe("answerEntry", () => {
  // Bug caught: every answer became a truth known to all, so "a secret to uncover" and "known to some" were ignored.
  it("builds a truth with the chosen knowledge, or a secret, titled with the trimmed answer", () => {
    expect(answerEntry("  The Stain is a wound.  ", "some")).toEqual({ part: "truth", knowledge: "some", title: "The Stain is a wound." });
    expect(answerEntry("x", "secret")).toMatchObject({ part: "truth", knowledge: "secret" });
    expect(answerEntry("Sift knows.", "secret-to-uncover")).toEqual({ part: "secret", title: "Sift knows." });
  });
});

describe("answeredPatch", () => {
  // Bug caught: closing without the note or the pointer, so the answer could not be read or followed.
  it("sets all four columns together", () => {
    expect(answeredPatch(" Sift ", "new1", "2026-11-23T10:00:00Z")).toEqual({
      closed_as: "answered",
      closed_at: "2026-11-23T10:00:00Z",
      closed_note: "Sift",
      became_entry_id: "new1",
    });
  });
});

describe("reopening", () => {
  // Bug caught: leaving closed_note set on reopen, which the table refuses (23514, note only when closed).
  it("nulls all four columns of a question and all three of a force", () => {
    expect(REOPEN_QUESTION_PATCH).toEqual({ closed_as: null, closed_at: null, closed_note: null, became_entry_id: null });
    expect(RESUME_FORCE_PATCH).toEqual({ closed_as: null, closed_at: null, closed_note: null, became_entry_id: null });
  });
});

describe("endForcePatch", () => {
  // Bug caught: an empty note stored as "", which reads as a note and shows an empty line in the banner.
  it("stores a blank note as no note and trims a real one", () => {
    expect(endForcePatch("faded", "   ", "t").closed_note).toBeNull();
    expect(endForcePatch("stopped", " Sift stopped it. ", "t")).toEqual({ closed_as: "stopped", closed_at: "t", closed_note: "Sift stopped it." });
  });
});

describe("forceOutcome", () => {
  it("is the outcome of an ended force and null for a moving one", () => {
    expect(forceOutcome(canonEntry({ part: "force", closed_as: "faded" }))).toBe("faded");
    expect(forceOutcome(canonEntry({ part: "force" }))).toBeNull();
  });
});

describe("endForce", () => {
  const writers = (over: Partial<Parameters<typeof endForce>[4]> = {}) => ({
    createTruth: vi.fn().mockResolvedValue({ id: "truth1" }),
    updateForce: vi.fn().mockResolvedValue(undefined),
    linkLedTo: vi.fn().mockResolvedValue(undefined),
    ...over,
  });

  // Bug caught (#1258 item 10): ending a force left nothing behind, so "the Stain won" was never written into what is true.
  it("with a line makes a truth known to all, closes the force pointing at it and ties them led_to", async () => {
    const w = writers();
    const result = await endForce("succeeded", "Sift burned it.", "  The orchards are dead.  ", "t", w);
    expect(w.createTruth).toHaveBeenCalledWith({ part: "truth", knowledge: "all", title: "The orchards are dead." });
    expect(w.updateForce).toHaveBeenCalledWith({ closed_as: "succeeded", closed_at: "t", closed_note: "Sift burned it.", became_entry_id: "truth1" });
    expect(w.linkLedTo).toHaveBeenCalledWith("truth1", "The orchards are dead.");
    expect(result.linkError).toBeNull();
  });

  // Bug caught: a blank "true now" line still created an empty truth.
  it("without a line (or a blank one) writes no truth, no pointer and no link", async () => {
    for (const blank of ["", "   "]) {
      const w = writers();
      await endForce("faded", "", blank, "t", w);
      expect(w.createTruth).not.toHaveBeenCalled();
      expect(w.linkLedTo).not.toHaveBeenCalled();
      expect(w.updateForce).toHaveBeenCalledWith({ closed_as: "faded", closed_at: "t", closed_note: null });
    }
  });

  // Bug caught: a truth that failed to save still closed the force, ending it with nothing true behind it.
  it("leaves the force moving when the truth cannot be made", async () => {
    const w = writers({ createTruth: vi.fn().mockRejectedValue(new Error("no")) });
    await expect(endForce("stopped", "", "It is over.", "t", w)).rejects.toThrow("no");
    expect(w.updateForce).not.toHaveBeenCalled();
  });

  // Bug caught: a failed link threw away the close that had already been written, so the caller could not tell the force had ended.
  it("reports a failed link instead of throwing, the force already closed", async () => {
    const w = writers({ linkLedTo: vi.fn().mockRejectedValue(new Error("link down")) });
    const result = await endForce("stopped", "", "It is over.", "t", w);
    expect(w.updateForce).toHaveBeenCalled();
    expect(result.linkError?.message).toBe("link down");
  });
});
