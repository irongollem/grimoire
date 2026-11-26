import { describe, expect, it } from "vitest";
import { DIGEST_EXCERPT_CHARS, DIGEST_MAX_ENTRIES, canonDigestLines, type DigestEntry } from "./canonDigest";

const entry = (over: Partial<DigestEntry>): DigestEntry => ({ part: "truth", title: "", text: "", closed: false, ...over });

describe("canonDigestLines", () => {
  // Bug caught: a helper drafting forces or a backstory never seeing the arcs, forces and secrets already written, so the
  // walk's later sections ignored the earlier ones (maintainer, 26 Nov 2026).
  it("lists the arcs and every part beyond the premise, in the book's order", () => {
    const lines = canonDigestLines(
      [entry({ part: "secret", title: "The ledger was forged" }), entry({ part: "truth", title: "Salt keeps the dead quiet" }), entry({ part: "premise", title: "Pitch" })],
      [{ name: "The Salt Owed", question: "Will the town pay?", status: "planned" }],
    );
    expect(lines).toEqual([
      "Arc (planned): The Salt Owed: asks Will the town pay?",
      "Truth: Salt keeps the dead quiet",
      "Secret: The ledger was forged",
    ]);
  });

  // Bug caught: an ended force or an answered question offered as still open, so a draft builds on what is over.
  it("marks what has closed", () => {
    expect(canonDigestLines([entry({ part: "force", title: "The tide rises", closed: true })], [])).toEqual(["Force (closed): The tide rises"]);
  });

  // Bug caught: a large canon sent whole, so one draft costs a whole book of tokens.
  it("caps the entries and cuts each text", () => {
    const many = Array.from({ length: DIGEST_MAX_ENTRIES + 10 }, (_, i) => entry({ title: `T${i}`, text: "x".repeat(DIGEST_EXCERPT_CHARS + 50) }));
    const lines = canonDigestLines(many, []);
    expect(lines).toHaveLength(DIGEST_MAX_ENTRIES);
    expect(lines[0]).toBe(`Truth: T0: ${"x".repeat(DIGEST_EXCERPT_CHARS)}`);
  });

  // Bug caught: blank entries (an add row's empty start) filling the digest with lines that say nothing.
  it("leaves out an entry with no words", () => {
    expect(canonDigestLines([entry({ title: "  ", text: "" })], [])).toEqual([]);
  });
});
