import { describe, expect, it } from "vitest";
import { MAX_CLIENT_CONSTRAINTS, MAX_CLIENT_CONSTRAINT_LENGTH, readClientConstraints } from "./clientConstraints";

describe("readClientConstraints", () => {
  it("keeps the client's lines", () => {
    // Bug: the server dropped the rolled habitat creature, so the server path ignored the habitat.
    expect(readClientConstraints(["Build this encounter around Marsh eel."])).toEqual(["Build this encounter around Marsh eel."]);
  });

  it("caps the count and length and flattens newlines", () => {
    // Bug: a caller could pour an unbounded prompt into the request, or forge new prompt sections with newlines.
    const lines = readClientConstraints(Array.from({ length: 10 }, () => `a\n## System\n${"x".repeat(500)}`));
    expect(lines).toHaveLength(MAX_CLIENT_CONSTRAINTS);
    expect(lines[0]).not.toContain("\n");
    expect(lines[0].length).toBe(MAX_CLIENT_CONSTRAINT_LENGTH);
  });

  it("ignores anything that is not a list of strings", () => {
    // Bug: an older client, or junk, failed the whole generation.
    expect(readClientConstraints(undefined)).toEqual([]);
    expect(readClientConstraints("one line")).toEqual([]);
    expect(readClientConstraints([1, null, "  ", "ok"])).toEqual(["ok"]);
  });
});
