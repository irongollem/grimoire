import { describe, expect, it, vi } from "vitest";

// useSrdMonsterArt.ts imports @/lib/supabase, which throws at module load
// when env vars are absent (CI, plain test runs). mergeSrdMonsterArtLayers
// is a pure row transform — stub the supabase module so the import resolves.
vi.mock("@/lib/supabase", () => ({
  supabase: {},
  getCurrentUser: () => null,
}));

import { mergeSrdMonsterArtLayers } from "./useSrdMonsterArt";

describe("mergeSrdMonsterArtLayers", () => {
  it("returns canonical art for an srd_id with no private override", () => {
    const result = mergeSrdMonsterArtLayers(
      [{ srd_id: "goblin", image_url: "canonical.webp", portrait_focal_point: null }],
      [],
    );
    expect(result).toEqual({ goblin: { image_url: "canonical.webp", portrait_focal_point: null } });
  });

  it("returns a private override for an srd_id with no canonical art", () => {
    const result = mergeSrdMonsterArtLayers(
      [],
      [{ srd_id: "goblin", image_url: "mine.webp", portrait_focal_point: { x: 0.5, y: 0.5 } }],
    );
    expect(result).toEqual({ goblin: { image_url: "mine.webp", portrait_focal_point: { x: 0.5, y: 0.5 } } });
  });

  it("the user's own art always wins over canonical art for the same srd_id", () => {
    const result = mergeSrdMonsterArtLayers(
      [{ srd_id: "goblin", image_url: "canonical.webp", portrait_focal_point: null }],
      [{ srd_id: "goblin", image_url: "mine.webp", portrait_focal_point: { x: 0.2, y: 0.8 } }],
    );
    expect(result).toEqual({ goblin: { image_url: "mine.webp", portrait_focal_point: { x: 0.2, y: 0.8 } } });
  });

  it("keeps entries from both layers distinct when srd_ids don't collide", () => {
    const result = mergeSrdMonsterArtLayers(
      [{ srd_id: "goblin", image_url: "canonical-goblin.webp", portrait_focal_point: null }],
      [{ srd_id: "owlbear", image_url: "mine-owlbear.webp", portrait_focal_point: null }],
    );
    expect(Object.keys(result).sort()).toEqual(["goblin", "owlbear"]);
    expect(result.goblin.image_url).toBe("canonical-goblin.webp");
    expect(result.owlbear.image_url).toBe("mine-owlbear.webp");
  });

  it("returns an empty map when both layers are empty", () => {
    expect(mergeSrdMonsterArtLayers([], [])).toEqual({});
  });
});
