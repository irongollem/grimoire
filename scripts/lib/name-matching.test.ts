import { describe, expect, it } from "vitest";

import {
  findPotentialDuplicates,
  levenshtein,
  normalizeName,
} from "./name-matching";

describe("normalizeName", () => {
  it("lowercases + trims + collapses internal whitespace", () => {
    expect(normalizeName("  Madame   Petrichor  ")).toBe("madame petrichor");
    expect(normalizeName("VELLETTE\tQUIVERGLASS")).toBe("vellette quiverglass");
  });
});

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("", "")).toBe(0);
    expect(levenshtein("abc", "abc")).toBe(0);
  });

  it("returns the length of the other string when one is empty", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });

  it("counts single-character insertions, deletions, substitutions as distance 1", () => {
    expect(levenshtein("velette", "vellette")).toBe(1);   // insertion
    expect(levenshtein("sippet", "sipet")).toBe(1);       // deletion
    expect(levenshtein("tippet", "sippet")).toBe(1);      // substitution
  });

  it("counts 2 for two-char edits", () => {
    expect(levenshtein("anna", "annie")).toBe(2);
    expect(levenshtein("kitten", "sittin")).toBe(2);
  });

  it("counts higher distance for structurally distinct names", () => {
    // Bract → Bramble: replace c→m, replace t→b, insert l, insert e = 4
    expect(levenshtein("bract", "bramble")).toBe(4);
    // "madame petrichor" → "madame petrichor & cinder" = +9 chars
    expect(levenshtein("madame petrichor", "madame petrichor & cinder")).toBe(9);
  });

  it("is symmetric", () => {
    expect(levenshtein("velette", "vellette")).toBe(levenshtein("vellette", "velette"));
    expect(levenshtein("anna", "annie")).toBe(levenshtein("annie", "anna"));
  });
});

describe("findPotentialDuplicates — substring layer (existing behaviour preserved)", () => {
  it("catches the Petrichor case (candidate is substring of existing)", () => {
    const existing = ["madame petrichor & cinder"];
    expect(findPotentialDuplicates("Madame Petrichor", existing)).toEqual([
      "madame petrichor & cinder",
    ]);
  });

  it("catches the reverse case (existing is substring of candidate)", () => {
    expect(findPotentialDuplicates("Madame Petrichor", ["petrichor"])).toEqual(["petrichor"]);
  });

  it("ignores exact matches (caller handles those as silent idempotent skip)", () => {
    expect(findPotentialDuplicates("Madame Petrichor", ["madame petrichor"])).toEqual([]);
  });
});

describe("findPotentialDuplicates — fuzzy (Levenshtein) layer", () => {
  // Regression: the Velette/Vellette case from production. The user hand-typed
  // "Velette" (one L) when the source markdown has "Vellette" (two Ls). The
  // substring detection couldn't catch this — neither is a substring of the
  // other. Fuzzy matching catches the single-insertion typo class.
  it("catches the Velette/Vellette case (1-char insertion typo)", () => {
    const existing = ["velette quiverglass"];
    expect(findPotentialDuplicates("Vellette Quiverglass", existing))
      .toEqual(["velette quiverglass"]);
  });

  it("catches the reverse direction (typo'd candidate vs canonical existing)", () => {
    const existing = ["vellette quiverglass"];
    expect(findPotentialDuplicates("Velette Quiverglass", existing))
      .toEqual(["vellette quiverglass"]);
  });

  it("catches the Tippet/Sippet class (1-char substitution typo)", () => {
    expect(findPotentialDuplicates("Old Tippet", ["old sippet"]))
      .toEqual(["old sippet"]);
  });

  it("catches 2-char-edit typos within threshold", () => {
    expect(findPotentialDuplicates("Annie", ["anna"]))
      .toEqual(["anna"]);
  });

  it("does NOT flag legitimately distinct names beyond distance 2", () => {
    // Bract ↔ Bramble: distance 4. Both real NPCs in the campaign.
    expect(findPotentialDuplicates("Bract", ["bramble"])).toEqual([]);
    // Hush ↔ Holder: distance 5. Both real NPCs.
    expect(findPotentialDuplicates("Hush", ["holder"])).toEqual([]);
  });

  it("respects the minLength floor for fuzzy matching (skips short names)", () => {
    // "Sip" vs "Sup" are both 3-char names with distance 1 — would otherwise
    // false-positive on every other 3-char name. Length floor of 4 filters.
    expect(findPotentialDuplicates("Sip", ["sup"])).toEqual([]);
    expect(findPotentialDuplicates("Pim", ["pip"])).toEqual([]);
  });

  it("does flag fuzzy matches once names cross the length floor", () => {
    // 4-char names where the substring check doesn't fire (neither contains
    // the other) and Levenshtein distance is ≤ 2.
    expect(findPotentialDuplicates("anna", ["arna"])).toEqual(["arna"]); // substitute n→r
  });
});

describe("findPotentialDuplicates — deduplication of multi-layer hits", () => {
  it("returns each existing name at most once even if multiple layers would match", () => {
    // "vellette" is substring of "vellette quiverglass" AND within Levenshtein
    // distance — both layers fire. Should still be reported once.
    const existing = ["vellette quiverglass"];
    const hits = findPotentialDuplicates("Vellette", existing);
    expect(hits).toEqual(["vellette quiverglass"]);
    expect(hits.length).toBe(1);
  });
});
