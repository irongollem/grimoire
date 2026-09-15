import { describe, expect, it } from "vitest";

import {
  diagnoseCategory,
  dominantSurface,
  formatCategoryLabel,
  formatGenerationType,
  gaugePercent,
  isBulkGenerationType,
  type PromptScreeningCategoryHint,
  type PromptScreeningTypeBreakdown,
} from "./usePromptScreening";

function hint(overrides: Partial<PromptScreeningCategoryHint> = {}): PromptScreeningCategoryHint {
  return {
    category: "sexual",
    threshold: 0.9,
    samples: 100,
    p50: 0.001,
    p95: 0.2,
    max_allowed: 0.4,
    blocked_here: 0,
    refused_after_pass: 0,
    ...overrides,
  };
}

describe("diagnoseCategory", () => {
  it("reads no samples as no_data, even with a threshold set", () => {
    expect(diagnoseCategory(hint({ samples: 0, max_allowed: null, p50: null, p95: null }))).toBe(
      "no_data",
    );
  });

  it("flags too_high the moment the renderer has disagreed even once", () => {
    expect(diagnoseCategory(hint({ refused_after_pass: 1, max_allowed: 0.89 }))).toBe("too_high");
  });

  it("outranks headroom with too_high — a disagreement is the trustworthy signal", () => {
    // max_allowed sits far below threshold (would read as headroom on its own),
    // but a real disagreement exists, and that must win.
    expect(diagnoseCategory(hint({ refused_after_pass: 1, max_allowed: 0.1, threshold: 0.9 }))).toBe(
      "too_high",
    );
  });

  it("flags headroom when the highest allowed score sits well under the threshold", () => {
    expect(diagnoseCategory(hint({ threshold: 0.9, max_allowed: 0.3 }))).toBe("headroom");
  });

  it("does not flag headroom for a merely-comfortable margin", () => {
    // 0.5 is not <= half of 0.9 (0.45), so this is steady, not headroom.
    expect(diagnoseCategory(hint({ threshold: 0.9, max_allowed: 0.5 }))).toBe("steady");
  });

  it("reads exactly half the threshold as headroom (boundary is inclusive)", () => {
    expect(diagnoseCategory(hint({ threshold: 0.8, max_allowed: 0.4 }))).toBe("headroom");
  });

  it("reads steady when nothing passed to measure headroom from, but samples exist", () => {
    // e.g. every sample this window happened to be blocked.
    expect(diagnoseCategory(hint({ max_allowed: null, samples: 3, blocked_here: 3 }))).toBe(
      "steady",
    );
  });
});

describe("formatCategoryLabel", () => {
  it("capitalises a bare category with no slash", () => {
    expect(formatCategoryLabel("sexual")).toBe("Sexual");
    expect(formatCategoryLabel("hate")).toBe("Hate");
  });

  it("capitalises only the first segment of a slashed category", () => {
    expect(formatCategoryLabel("sexual/minors")).toBe("Sexual / minors");
    expect(formatCategoryLabel("hate/threatening")).toBe("Hate / threatening");
    expect(formatCategoryLabel("self-harm/instructions")).toBe("Self-harm / instructions");
  });
});

describe("gaugePercent", () => {
  it("scales a mid-range probability to a percentage", () => {
    expect(gaugePercent(0.42)).toBeCloseTo(42);
  });

  it("clamps below zero to 0", () => {
    expect(gaugePercent(-0.1)).toBe(0);
  });

  it("clamps above one to 100", () => {
    expect(gaugePercent(1.2)).toBe(100);
  });
});

describe("formatGenerationType", () => {
  it("title-cases an ordinary snake_case surface", () => {
    expect(formatGenerationType("entity_image")).toBe("Entity Image");
    expect(formatGenerationType("tile_pack")).toBe("Tile Pack");
  });

  it("spells out the npc acronym instead of title-casing it", () => {
    expect(formatGenerationType("npc_portrait")).toBe("NPC Portrait");
    expect(formatGenerationType("npc_disguise_portrait")).toBe("NPC Disguise Portrait");
  });
});

describe("isBulkGenerationType", () => {
  it("flags tile_pack — dozens of templated prompts per DM action", () => {
    expect(isBulkGenerationType("tile_pack")).toBe(true);
  });

  it("does not flag an ordinary one-per-request surface", () => {
    expect(isBulkGenerationType("entity_image")).toBe(false);
    expect(isBulkGenerationType("npc_portrait")).toBe(false);
  });
});

function breakdown(overrides: Partial<PromptScreeningTypeBreakdown> = {}): PromptScreeningTypeBreakdown {
  return { generation_type: "entity_image", screenings: 10, blocked: 0, refused_after_pass: 0, ...overrides };
}

describe("dominantSurface", () => {
  it("is null for an empty breakdown", () => {
    expect(dominantSurface([])).toBeNull();
  });

  it("is null when every surface's screenings are zero", () => {
    expect(dominantSurface([breakdown({ screenings: 0 }), breakdown({ generation_type: "tile_pack", screenings: 0 })])).toBeNull();
  });

  it("is null when no single surface reaches half the window", () => {
    const rows = [
      breakdown({ generation_type: "entity_image", screenings: 40 }),
      breakdown({ generation_type: "npc_portrait", screenings: 40 }),
      breakdown({ generation_type: "tile_pack", screenings: 20 }),
    ];
    expect(dominantSurface(rows)).toBeNull();
  });

  it("names the surface once it reaches half the window, and marks it bulk", () => {
    const rows = [
      breakdown({ generation_type: "tile_pack", screenings: 60 }),
      breakdown({ generation_type: "entity_image", screenings: 40 }),
    ];
    expect(dominantSurface(rows)).toEqual({ generation_type: "tile_pack", share: 0.6, bulk: true });
  });

  it("marks a dominant DM-authored surface as not bulk", () => {
    const rows = [
      breakdown({ generation_type: "entity_image", screenings: 70 }),
      breakdown({ generation_type: "npc_portrait", screenings: 30 }),
    ];
    expect(dominantSurface(rows)).toEqual({ generation_type: "entity_image", share: 0.7, bulk: false });
  });

  it("finds the top surface regardless of the array's own order", () => {
    const rows = [
      breakdown({ generation_type: "entity_image", screenings: 10 }),
      breakdown({ generation_type: "tile_pack", screenings: 90 }),
    ];
    expect(dominantSurface(rows)?.generation_type).toBe("tile_pack");
  });
});
