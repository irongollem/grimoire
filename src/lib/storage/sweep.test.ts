import { describe, it, expect } from "vitest";
import { planVariantSweep, sweepTargets, targetLabel, type SweepTarget } from "./sweep";
import { BUCKETS, BUCKET_ENTRIES, VARIANT_WIDTHS, variantPath } from "./buckets";
import { bucketWritePolicy } from "@edge-shared/storage-policy.ts";

describe("planVariantSweep", () => {
  it("returns zeros and an empty worklist for an empty listing", () => {
    expect(planVariantSweep([])).toEqual({ originals: 0, complete: 0, worklist: [] });
  });

  it("counts a complete set — original plus all four variants — as complete with no worklist entry", () => {
    const paths = [
      "u1/a.webp",
      "u1/a_w200.webp",
      "u1/a_w300.webp",
      "u1/a_w400.webp",
      "u1/a_w600.webp",
    ];
    expect(planVariantSweep(paths)).toEqual({ originals: 1, complete: 1, worklist: [] });
  });

  it("lists all four widths for an original with zero variants — the real production case (#619): 94 of 97 srd/ spell originals shipped with no variants at all", () => {
    const plan = planVariantSweep(["srd/fireball.webp"]);
    expect(plan).toEqual({
      originals: 1,
      complete: 0,
      worklist: [{ path: "srd/fireball.webp", missing: [200, 300, 400, 600] }],
    });
  });

  it("lists exactly the missing widths for a partial set", () => {
    const paths = ["u1/a.webp", "u1/a_w200.webp", "u1/a_w400.webp"];
    const plan = planVariantSweep(paths);
    expect(plan).toEqual({
      originals: 1,
      complete: 0,
      worklist: [{ path: "u1/a.webp", missing: [300, 600] }],
    });
  });

  it("matches a .jpeg original against .webp variants — variantPath's contract is that variants are always webp regardless of the original's extension", () => {
    const paths = [
      "u1/a.jpeg",
      "u1/a_w200.webp",
      "u1/a_w300.webp",
      "u1/a_w400.webp",
      "u1/a_w600.webp",
    ];
    expect(planVariantSweep(paths)).toEqual({ originals: 1, complete: 1, worklist: [] });
  });

  it("treats historical recursive variants (a_w200_w300.png, from an old re-processing bug) as variants, never as originals needing their own variants", () => {
    // If this regressed, the sweep would try to source variants of a variant and
    // permanently report a phantom original as incomplete.
    const plan = planVariantSweep(["u1/a.webp", "u1/a_w200.webp", "u1/a_w200_w300.png"]);
    expect(plan.originals).toBe(1);
    expect(plan.worklist).toEqual([{ path: "u1/a.webp", missing: [300, 400, 600] }]);
  });

  it("computes counts and worklist per-original when multiple originals are mixed in one listing", () => {
    const paths = [
      // complete
      "u1/a.webp",
      "u1/a_w200.webp",
      "u1/a_w300.webp",
      "u1/a_w400.webp",
      "u1/a_w600.webp",
      // zero variants
      "u1/b.webp",
      // partial
      "u1/c.webp",
      "u1/c_w600.webp",
    ];
    const plan = planVariantSweep(paths);
    expect(plan.originals).toBe(3);
    expect(plan.complete).toBe(1);
    expect(plan.worklist).toEqual([
      { path: "u1/b.webp", missing: [200, 300, 400, 600] },
      { path: "u1/c.webp", missing: [200, 300, 400] },
    ]);
  });
});

describe("sweepTargets", () => {
  const targets = sweepTargets("admin-uuid");
  const bucketsSwept = new Set(targets.map((t) => t.bucket));

  it("includes only variant-generating image buckets, per each bucket's generateVariants flag rather than a hardcoded list", () => {
    for (const [key, cfg] of BUCKET_ENTRIES) {
      expect(bucketsSwept.has(key), `${key} generateVariants=${cfg.generateVariants}`).toBe(
        cfg.generateVariants,
      );
    }
    // Spot-check the two ends explicitly, since a bug that inverted the flag
    // check would still pass the loop above with everything flipped.
    expect(bucketsSwept.has("spellImages")).toBe(true);
    expect(bucketsSwept.has("monsterImages")).toBe(true);
    expect(bucketsSwept.has("npcPortraits")).toBe(true);
    expect(bucketsSwept.has("assetImages")).toBe(false);
    expect(bucketsSwept.has("chronicle")).toBe(false);
    expect(bucketsSwept.has("sounds")).toBe(false);
    expect(bucketsSwept.has("soundImages")).toBe(false);
    expect(bucketsSwept.has("miniModels")).toBe(false);
  });

  it("emits an srd/ target exactly for the buckets whose write policy declares it, and no others", () => {
    const srdBuckets = targets.filter((t) => t.prefix === "srd").map((t) => t.bucket).sort();
    expect(srdBuckets).toEqual(["monsterImages", "spellImages"]);
  });

  it("gives every included bucket a target for the admin's own uuid prefix", () => {
    for (const key of bucketsSwept) {
      expect(targets).toContainEqual({ bucket: key, prefix: "admin-uuid" });
    }
  });

  it("never targets a bucket whose write policy has clientWrites: false", () => {
    for (const target of targets) {
      const policy = bucketWritePolicy(BUCKETS[target.bucket].id);
      expect(policy?.clientWrites, `${target.bucket} policy`).toBe(true);
    }
  });
});

describe("targetLabel", () => {
  it("renders the admin's own uuid prefix as \"your uploads\"", () => {
    const target: SweepTarget = { bucket: "spellImages", prefix: "admin-uuid" };
    expect(targetLabel(target, "admin-uuid")).toBe("spell-images · your uploads");
  });

  it("renders a shared prefix with a trailing slash", () => {
    const target: SweepTarget = { bucket: "spellImages", prefix: "srd" };
    expect(targetLabel(target, "admin-uuid")).toBe("spell-images · srd/");
  });
});

// Sanity check on the VARIANT_WIDTHS/variantPath fixtures used throughout this
// file, so a change to those primitives fails loudly here instead of via a
// confusing mismatch in the assertions above.
describe("fixture sanity", () => {
  it("VARIANT_WIDTHS is the four FocalImage render widths", () => {
    expect(VARIANT_WIDTHS).toEqual([200, 300, 400, 600]);
  });

  it("variantPath appends _w<width> before the extension", () => {
    expect(variantPath("u1/a.webp", 400)).toBe("u1/a_w400.webp");
  });
});
