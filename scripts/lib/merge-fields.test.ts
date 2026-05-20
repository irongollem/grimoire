import { describe, expect, it } from "vitest";

import {
  SOURCE_APPEND_SEPARATOR,
  mergeField,
  planForceOverwrite,
  planRowMerge,
  summarisePlan,
  type FieldSpec,
} from "./merge-fields";

const SCALAR: FieldSpec = { kind: "scalar" };
const ARRAY: FieldSpec = { kind: "array" };
const PROSE: FieldSpec = { kind: "prose" };

describe("mergeField — scalar", () => {
  it("fills empty existing from source", () => {
    expect(mergeField(null, "x", SCALAR)).toEqual({ action: "fill", newValue: "x" });
    expect(mergeField(undefined, "x", SCALAR)).toEqual({ action: "fill", newValue: "x" });
    expect(mergeField("", "x", SCALAR)).toEqual({ action: "fill", newValue: "x" });
    expect(mergeField("   ", "x", SCALAR)).toEqual({ action: "fill", newValue: "x" });
  });

  it("never overwrites a non-empty existing scalar (noop when source is empty)", () => {
    expect(mergeField("user", null, SCALAR)).toEqual({ action: "noop" });
    expect(mergeField("user", "", SCALAR)).toEqual({ action: "noop" });
  });

  it("returns conflict when both have different non-empty values", () => {
    const out = mergeField("Lawful Good", "True Neutral", SCALAR);
    expect(out).toEqual({ action: "conflict", existing: "Lawful Good", source: "True Neutral" });
  });

  it("returns noop when both have the same value (whitespace-tolerant)", () => {
    expect(mergeField("alive", "alive", SCALAR)).toEqual({ action: "noop" });
    expect(mergeField("  alive ", "alive", SCALAR)).toEqual({ action: "noop" });
  });
});

describe("mergeField — array", () => {
  it("unions existing + source, preserving existing order then appending new items", () => {
    const out = mergeField(["a", "b"], ["c", "b", "d"], ARRAY);
    expect(out).toEqual({ action: "union", newValue: ["a", "b", "c", "d"], addedItems: ["c", "d"] });
  });

  it("noop when source contributes nothing", () => {
    expect(mergeField(["a", "b"], ["a"], ARRAY)).toEqual({ action: "noop" });
    expect(mergeField(["a", "b"], [], ARRAY)).toEqual({ action: "noop" });
  });

  it("fills from empty existing (union of [] with source = source)", () => {
    const out = mergeField([], ["a", "b"], ARRAY);
    expect(out).toEqual({ action: "union", newValue: ["a", "b"], addedItems: ["a", "b"] });
  });

  it("never dedupes-down (existing-only items survive)", () => {
    const out = mergeField(["custom-tag", "x"], ["x"], ARRAY);
    expect(out).toEqual({ action: "noop" });
    const out2 = mergeField(["custom-tag", "x"], ["y"], ARRAY);
    expect(out2.action).toBe("union");
    if (out2.action === "union") {
      expect(out2.newValue).toEqual(["custom-tag", "x", "y"]);
    }
  });

  it("handles null existing as empty array", () => {
    const out = mergeField(null, ["a"], ARRAY);
    expect(out).toEqual({ action: "union", newValue: ["a"], addedItems: ["a"] });
  });
});

describe("mergeField — prose", () => {
  const big = "x".repeat(500);

  it("fills empty existing", () => {
    expect(mergeField(null, big, PROSE)).toEqual({ action: "fill", newValue: big });
  });

  it("appends source below separator when existing is a stub and source is substantially longer", () => {
    const stub = "short user note";
    const out = mergeField(stub, big, PROSE);
    expect(out.action).toBe("append");
    if (out.action === "append") {
      expect(out.newValue).toBe(stub + SOURCE_APPEND_SEPARATOR + big);
      expect(out.appended).toBe(big);
    }
  });

  it("returns conflict when existing is long (not a stub) and differs from source", () => {
    const longExisting = "x".repeat(300);
    const longSource = "y".repeat(900);
    const out = mergeField(longExisting, longSource, PROSE);
    expect(out.action).toBe("conflict");
  });

  it("returns conflict when existing is a stub but source isn't substantially bigger (< 2× existing)", () => {
    const out = mergeField("100 chars of user text padded out so it's exactly one hundred chars long for this test ABC", "150 chars of source content padded out so it sits below the 2× ratio for this test ABCDEFG", PROSE);
    expect(out.action).toBe("conflict");
  });

  it("respects custom stubThresholdChars + stubMultiplier", () => {
    const spec: FieldSpec = { kind: "prose", stubThresholdChars: 50, stubMultiplier: 5 };
    const existing = "stub"; // 4 chars
    const source = "x".repeat(40);  // 10× existing, well above multiplier
    const out = mergeField(existing, source, spec);
    expect(out.action).toBe("append");
  });

  it("returns noop when existing and source are identical", () => {
    expect(mergeField("same prose", "same prose", PROSE)).toEqual({ action: "noop" });
  });
});

describe("planRowMerge — Bell-Mother-style enrichment", () => {
  it("fills description + portfolio + tags, leaves hand-set alignment + domains alone", () => {
    const existing = {
      name: "The Bell-Mother",
      alignment: "Lawful Good",
      domains: ["Light", "Order", "Peace"],
      portfolio: null,
      description: null,
      symbol: null,
      tags: [],
    };
    const source = {
      name: "The Bell-Mother",
      alignment: null,                    // source didn't set
      domains: ["Light", "Peace"],        // subset of existing — union = existing, noop
      portfolio: "The patron of welcoming, of the bell-note.",
      description: "x".repeat(1000),
      symbol: null,                       // source didn't set
      tags: ["faith", "primary-sippet", "honored-by-brewlings"],
    };
    const plan = planRowMerge(existing, source, {
      name: { kind: "scalar" },
      alignment: { kind: "scalar" },
      domains: { kind: "array" },
      portfolio: { kind: "scalar" },
      description: { kind: "prose" },
      symbol: { kind: "scalar" },
      tags: { kind: "array" },
    });
    expect(plan.filled.sort()).toEqual(["description", "portfolio"]);
    expect(plan.unioned).toEqual(["tags"]);
    expect(plan.conflicts).toEqual([]);
    expect(plan.unchanged.sort()).toEqual(["alignment", "domains", "name", "symbol"]);
    // Updates should ONLY contain the changed fields:
    expect(Object.keys(plan.updates).sort()).toEqual(["description", "portfolio", "tags"]);
    expect(plan.updates.tags).toEqual(["faith", "primary-sippet", "honored-by-brewlings"]);
  });
});

describe("planRowMerge — conflict surfaces all mismatches", () => {
  it("collects every conflicting field without writing any of them", () => {
    const existing = { a: "user-A", b: "user-B", c: "user-C" };
    const source =   { a: "src-A",  b: "user-B", c: "src-C"  };
    const plan = planRowMerge(existing, source, {
      a: { kind: "scalar" }, b: { kind: "scalar" }, c: { kind: "scalar" },
    });
    expect(plan.conflicts.map((c) => c.field).sort()).toEqual(["a", "c"]);
    expect(plan.updates).toEqual({});
    expect(plan.unchanged).toEqual(["b"]);
  });
});

describe("planForceOverwrite — per-record override (Bell-Mother case)", () => {
  it("overwrites differing non-empty fields with source values, including when source is null", () => {
    // Bell-Mother: user typed alignment + domains from looking at the image,
    // not from lore. They want lore (faiths.md) to overwrite.
    const existing = {
      alignment: "Lawful Good",                  // user-set from image, wants overwritten
      domains: ["Light", "Order", "Peace"],      // user-set from image, wants overwritten
      symbol: null,                              // empty in both, noop
      portfolio: null,                           // empty existing, fill from source
      description: null,                         // empty existing, fill from source
      dm_notes: null,                            // empty in both, noop
      tags: [],                                  // empty existing, fill from source
    };
    const source = {
      alignment: null,                           // source has no alignment
      domains: ["Light", "Peace"],
      symbol: null,
      portfolio: "The patron of welcoming.",
      description: "x".repeat(800),
      dm_notes: null,
      tags: ["faith", "primary-sippet"],
    };
    const plan = planForceOverwrite(existing, source, {
      alignment: { kind: "scalar" },
      domains: { kind: "array" },
      symbol: { kind: "scalar" },
      portfolio: { kind: "scalar" },
      description: { kind: "prose" },
      dm_notes: { kind: "prose" },
      tags: { kind: "array" },
    });
    expect(plan.filled.sort()).toEqual(["alignment", "description", "domains", "portfolio", "tags"]);
    expect(plan.unchanged.sort()).toEqual(["dm_notes", "symbol"]);
    expect(plan.conflicts).toEqual([]);
    // alignment gets nulled out — user no longer wants "Lawful Good"
    expect(plan.updates.alignment).toBe(null);
    expect(plan.updates.domains).toEqual(["Light", "Peace"]);
    expect(plan.updates.portfolio).toBe("The patron of welcoming.");
    expect(plan.updates.tags).toEqual(["faith", "primary-sippet"]);
  });

  it("noop on identical arrays + identical scalars", () => {
    const plan = planForceOverwrite(
      { a: "x", b: ["1", "2"], c: null },
      { a: "x", b: ["1", "2"], c: null },
      { a: { kind: "scalar" }, b: { kind: "array" }, c: { kind: "scalar" } },
    );
    expect(plan.updates).toEqual({});
    expect(plan.unchanged.sort()).toEqual(["a", "b", "c"]);
  });

  it("never returns conflicts (the override IS the resolution)", () => {
    const plan = planForceOverwrite(
      { a: "user-A", b: "user-B" },
      { a: "src-A",  b: "src-B" },
      { a: { kind: "scalar" }, b: { kind: "scalar" } },
    );
    expect(plan.conflicts).toEqual([]);
    expect(plan.updates).toEqual({ a: "src-A", b: "src-B" });
  });

  it("does not touch fields outside fieldSpecs (image protection by omission)", () => {
    // image-like fields aren't in the spec → never written
    const plan = planForceOverwrite(
      { name: "X", symbol_image_url: "/canon/bell-mother.png", alignment: "Lawful Good" },
      { name: "X", symbol_image_url: null, alignment: null },
      { name: { kind: "scalar" }, alignment: { kind: "scalar" } }, // symbol_image_url NOT listed
    );
    expect(plan.updates).toEqual({ alignment: null });
    expect("symbol_image_url" in plan.updates).toBe(false);
  });
});

describe("summarisePlan", () => {
  it("renders a compact log line", () => {
    const plan = planRowMerge(
      { x: null, y: ["a"], z: "user" },
      { x: "filled", y: ["b"], z: "user" },
      { x: { kind: "scalar" }, y: { kind: "array" }, z: { kind: "scalar" } },
    );
    const s = summarisePlan(plan);
    expect(s).toContain("filled=[x]");
    expect(s).toContain("unioned=[y]");
    expect(s).not.toContain("conflicts");
  });

  it("returns 'no changes' when the plan is empty", () => {
    expect(summarisePlan({ updates: {}, filled: [], appended: [], unioned: [], conflicts: [], unchanged: [] }))
      .toBe("no changes");
  });
});
