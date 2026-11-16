import { describe, expect, it } from "vitest";
import type { TableQuestionOption } from "@/types/tableQuestion.types";
import { canBePet, petFromOption } from "./petFromOption";

const option = (ref: TableQuestionOption["ref"]): TableQuestionOption => ({
  id: "e1", label: "Marsh Toad", blurb: null, image_url: "https://x/toad.webp", focal: { x: 40, y: 60 }, ref, min: 1, max: 1,
});

describe("petFromOption", () => {
  it("makes a pet that never fights, owned by the character and sourced from the monster", () => {
    const pet = petFromOption(option({ kind: "monster", id: "srd_frog" }), "pm1");
    expect(pet).toMatchObject({
      name: "Marsh Toad",
      companion_type: "pet",
      source_type: "monster",
      source_monster_id: "srd_frog",
      source_npc_id: null,
      owner_party_member_id: "pm1",
      combat_ready: false,
      portrait_url: "https://x/toad.webp",
      portrait_focal_point: { x: 40, y: 60 },
    });
  });

  it("offers no pet for an item or a plain entry", () => {
    expect(petFromOption(option({ kind: "item", id: "i1" }), "pm1")).toBeNull();
    expect(petFromOption(option(null), "pm1")).toBeNull();
    expect(canBePet(option({ kind: "item", id: "i1" }))).toBe(false);
    expect(canBePet(option({ kind: "monster", id: "m" }))).toBe(true);
  });
});
