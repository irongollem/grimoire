import { describe, expect, it } from "vitest";
import { DEFAULT_GAME_SYSTEM, gameSystemEdition } from "@/systems/registry";
import { DEFAULT_RULESET } from "./ruleset.types";

describe("DEFAULT_RULESET", () => {
  // Fails if the default system moves and the default edition stays behind:
  // a campaign not loaded yet would key its library reads on the wrong edition.
  it("is the default game system's edition", () => {
    expect(gameSystemEdition(DEFAULT_GAME_SYSTEM)).toBe(DEFAULT_RULESET);
  });
});
