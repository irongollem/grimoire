import { describe, expect, it } from "vitest";
import { planCanonicalArtWrite } from "./canonicalArt";

const libraryRows = [
  { id: "wolf", image_url: "wolf.webp" },
  { id: "dire_wolf", image_url: "wolf.webp" },
  { id: "bear", image_url: "bear.webp" },
  { id: "bare", image_url: null },
];
const canonicalRows = [
  { entry_id: "worg", image_url: "wolf.webp" },
  { entry_id: "bear", image_url: "bear.webp" },
];

describe("planCanonicalArtWrite", () => {
  it("includes every library and canonical row showing the same picture", () => {
    const plan = planCanonicalArtWrite({
      entryId: "wolf",
      edit: { portrait_focal_point: { x: 0.2, y: 0.4 } },
      currentImageUrl: "wolf.webp",
      libraryRows,
      canonicalRows,
    });
    expect(plan.ids).toEqual(["wolf", "dire_wolf", "worg"]);
  });

  it("plans only the edited id when it has no picture, even if other rows have none either", () => {
    const plan = planCanonicalArtWrite({
      entryId: "bare",
      edit: { image_url: "new.webp" },
      currentImageUrl: null,
      libraryRows,
      canonicalRows,
    });
    expect(plan.ids).toEqual(["bare"]);
  });

  it("keeps the edited id once when it matches itself", () => {
    const plan = planCanonicalArtWrite({
      entryId: "bear",
      edit: { cutout_url: "c.webp" },
      currentImageUrl: "bear.webp",
      libraryRows,
      canonicalRows,
    });
    expect(plan.ids).toEqual(["bear"]);
  });

  it("lists only the fields the edit carries, treating null as present and undefined as absent", () => {
    const plan = planCanonicalArtWrite({
      entryId: "wolf",
      edit: { image_url: null, cutout_url: undefined, portrait_focal_point: { x: 0, y: 0 } },
      currentImageUrl: "wolf.webp",
      libraryRows,
      canonicalRows,
    });
    expect(plan.fields).toEqual(["image_url", "portrait_focal_point"]);
  });
});
