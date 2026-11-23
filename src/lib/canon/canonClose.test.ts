import { describe, expect, it } from "vitest";
import { REOPEN_QUESTION_PATCH, RESUME_FORCE_PATCH, answerEntry, answeredPatch, endForcePatch, forceOutcome } from "./canonClose";
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
    expect(RESUME_FORCE_PATCH).toEqual({ closed_as: null, closed_at: null, closed_note: null });
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
