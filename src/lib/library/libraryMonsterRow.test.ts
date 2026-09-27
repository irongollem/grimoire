import { describe, it, expect } from "vitest";
import { libraryMonsterRow } from "./libraryMonsterRow";

describe("libraryMonsterRow", () => {
  it("marks a shared row as belonging to no one, with no cutout of its own", () => {
    const monster = libraryMonsterRow({ id: "srd_owlbear", name: "Owlbear", image_url: "owlbear.webp" });
    expect(monster).toMatchObject({
      id: "srd_owlbear",
      name: "Owlbear",
      image_url: "owlbear.webp",
      user_id: "",
      campaign_id: null,
      is_shared: true,
      cutout_url: null,
    });
  });
});
