import { describe, expect, it, vi } from "vitest";

// useSrdSpellArt.ts imports @/lib/supabase, which throws at module load when
// env vars are absent (CI, plain test runs). mergeSrdSpellArtLayers is a
// pure row transform — stub the supabase module so the import resolves.
vi.mock("@/lib/supabase", () => ({
  supabase: {},
  getCurrentUser: () => null,
}));

import { mergeSrdSpellArtLayers } from "./useSrdSpellArt";

describe("mergeSrdSpellArtLayers", () => {
  it("returns canonical art for an srd_id with no private override", () => {
    const result = mergeSrdSpellArtLayers(
      [{ srd_id: "fireball", image_url: "canonical.webp", portrait_focal_point: null }],
      [],
    );
    expect(result).toEqual({ fireball: { image_url: "canonical.webp", portrait_focal_point: null } });
  });

  it("returns a private override for an srd_id with no canonical art", () => {
    const result = mergeSrdSpellArtLayers(
      [],
      [{ srd_id: "fireball", image_url: "mine.webp", portrait_focal_point: { x: 0.5, y: 0.5 } }],
    );
    expect(result).toEqual({ fireball: { image_url: "mine.webp", portrait_focal_point: { x: 0.5, y: 0.5 } } });
  });

  it("the user's own art always wins over canonical art for the same srd_id", () => {
    const result = mergeSrdSpellArtLayers(
      [{ srd_id: "fireball", image_url: "canonical.webp", portrait_focal_point: null }],
      [{ srd_id: "fireball", image_url: "mine.webp", portrait_focal_point: { x: 0.2, y: 0.8 } }],
    );
    expect(result).toEqual({ fireball: { image_url: "mine.webp", portrait_focal_point: { x: 0.2, y: 0.8 } } });
  });

  it("keeps entries from both layers distinct when srd_ids don't collide", () => {
    const result = mergeSrdSpellArtLayers(
      [{ srd_id: "fireball", image_url: "canonical-fireball.webp", portrait_focal_point: null }],
      [{ srd_id: "haste", image_url: "mine-haste.webp", portrait_focal_point: null }],
    );
    expect(Object.keys(result).sort()).toEqual(["fireball", "haste"]);
    expect(result.fireball.image_url).toBe("canonical-fireball.webp");
    expect(result.haste.image_url).toBe("mine-haste.webp");
  });

  it("returns an empty map when both layers are empty", () => {
    expect(mergeSrdSpellArtLayers([], [])).toEqual({});
  });
});
