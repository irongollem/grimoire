import { describe, expect, it, vi } from "vitest";

// useLibraryMonsterArt.ts imports @/lib/supabase, which throws at module load
// when env vars are absent (CI, plain test runs). mergeLibraryMonsterArtLayers
// is a pure row transform — stub the supabase module so the import resolves.
vi.mock("@/lib/supabase", () => ({
  supabase: {},
  getCurrentUser: () => null,
}));

import { mergeLibraryMonsterArtLayers, withLibraryArt } from "./useLibraryMonsterArt";

describe("mergeLibraryMonsterArtLayers", () => {
  it("returns canonical art for an entry_id with no private override", () => {
    const result = mergeLibraryMonsterArtLayers(
      [{ entry_id: "goblin", image_url: "canonical.webp", cutout_url: null, portrait_focal_point: null }],
      [],
    );
    expect(result).toEqual({ goblin: { image_url: "canonical.webp", cutout_url: null, portrait_focal_point: null } });
  });

  it("returns a private override for an entry_id with no canonical art", () => {
    const result = mergeLibraryMonsterArtLayers(
      [],
      [{ entry_id: "goblin", image_url: "mine.webp", cutout_url: null, portrait_focal_point: { x: 0.5, y: 0.5 } }],
    );
    expect(result).toEqual({
      goblin: { image_url: "mine.webp", cutout_url: null, portrait_focal_point: { x: 0.5, y: 0.5 } },
    });
  });

  it("the user's own art always wins over canonical art for the same entry_id", () => {
    const result = mergeLibraryMonsterArtLayers(
      [{ entry_id: "goblin", image_url: "canonical.webp", cutout_url: null, portrait_focal_point: null }],
      [{ entry_id: "goblin", image_url: "mine.webp", cutout_url: null, portrait_focal_point: { x: 0.2, y: 0.8 } }],
    );
    expect(result).toEqual({
      goblin: { image_url: "mine.webp", cutout_url: null, portrait_focal_point: { x: 0.2, y: 0.8 } },
    });
  });

  it("keeps entries from both layers distinct when srd_ids don't collide", () => {
    const result = mergeLibraryMonsterArtLayers(
      [{ entry_id: "goblin", image_url: "canonical-goblin.webp", cutout_url: null, portrait_focal_point: null }],
      [{ entry_id: "owlbear", image_url: "mine-owlbear.webp", cutout_url: null, portrait_focal_point: null }],
    );
    expect(Object.keys(result).sort()).toEqual(["goblin", "owlbear"]);
    expect(result.goblin.image_url).toBe("canonical-goblin.webp");
    expect(result.owlbear.image_url).toBe("mine-owlbear.webp");
  });

  it("returns an empty map when both layers are empty", () => {
    expect(mergeLibraryMonsterArtLayers([], [])).toEqual({});
  });

  it("keeps the canonical picture when the own row only overrides the cutout (per-field merge, #917)", () => {
    const result = mergeLibraryMonsterArtLayers(
      [{ entry_id: "goblin", image_url: "canonical.webp", cutout_url: null, portrait_focal_point: null }],
      [{ entry_id: "goblin", image_url: null, cutout_url: "mine-cut.webp", portrait_focal_point: null }],
    );
    expect(result.goblin).toEqual({ image_url: "canonical.webp", cutout_url: "mine-cut.webp", portrait_focal_point: null });
  });

  it("keeps the canonical cutout when the own row only overrides the picture", () => {
    const result = mergeLibraryMonsterArtLayers(
      [{ entry_id: "goblin", image_url: "canonical.webp", cutout_url: "canonical-cut.webp", portrait_focal_point: null }],
      [{ entry_id: "goblin", image_url: "mine.webp", cutout_url: null, portrait_focal_point: null }],
    );
    expect(result.goblin).toEqual({ image_url: "mine.webp", cutout_url: "canonical-cut.webp", portrait_focal_point: null });
  });
});

describe("withLibraryArt", () => {
  const row = {
    image_url: "row-picture.webp",
    cutout_url: "row-cutout.webp",
    portrait_focal_point: { x: 0.1, y: 0.1 },
  } as unknown as Parameters<typeof withLibraryArt>[0];

  it("returns the row unchanged when there is no art entry", () => {
    expect(withLibraryArt(row, undefined)).toBe(row);
  });

  it("overrides every field the art entry sets", () => {
    const result = withLibraryArt(row, {
      image_url: "art-picture.webp",
      cutout_url: "art-cutout.webp",
      portrait_focal_point: { x: 0.9, y: 0.9 },
    });
    expect(result.image_url).toBe("art-picture.webp");
    expect(result.cutout_url).toBe("art-cutout.webp");
    expect(result.portrait_focal_point).toEqual({ x: 0.9, y: 0.9 });
  });

  it("falls back to the row's own value for a field the art entry leaves null", () => {
    const result = withLibraryArt(row, { image_url: null, cutout_url: "art-cutout.webp", portrait_focal_point: null });
    expect(result.image_url).toBe("row-picture.webp");
    expect(result.cutout_url).toBe("art-cutout.webp");
    expect(result.portrait_focal_point).toEqual({ x: 0.1, y: 0.1 });
  });
});
