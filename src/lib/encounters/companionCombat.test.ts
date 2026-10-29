import { describe, expect, it } from "vitest";
import { COMPANION_TYPES } from "@/types/companion.types";
import { takesPartInCombat } from "./companionCombat";

describe("takesPartInCombat", () => {
  it("keeps a pet out of combat while every other kind of companion can fight (#1115)", () => {
    expect(takesPartInCombat({ companion_type: "pet" })).toBe(false);
    for (const type of COMPANION_TYPES.filter((t) => t !== "pet")) {
      expect(takesPartInCombat({ companion_type: type })).toBe(true);
    }
  });
});
