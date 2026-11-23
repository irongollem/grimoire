import { describe, expect, it } from "vitest";
import { averagePartyLevel, buildQuestHooksPrompt } from "./hooksPrompt";

describe("averagePartyLevel", () => {
  it("rounds up, and is 1 for an empty party", () => {
    expect(averagePartyLevel([3, 4])).toBe(4);
    expect(averagePartyLevel([])).toBe(1);
  });
});

describe("buildQuestHooksPrompt", () => {
  it("names the giver with their detail and the place, as constraints", () => {
    const { prompt } = buildQuestHooksPrompt({
      partyLevels: [3],
      giver: { name: "Mara", occupation: "baker", relationship: null },
      location: { name: "Sugarwell" },
      theme: "",
    });
    expect(prompt).toContain("Quest Giver: Mara (baker)");
    expect(prompt).toContain("Location: Sugarwell");
  });

  it("adds no constraint block when the DM fixed nothing", () => {
    const { prompt } = buildQuestHooksPrompt({ partyLevels: [2], giver: null, location: null, theme: "  " });
    expect(prompt).toBe("Party level: 2");
  });

  it("uses the theme as the concept, else a level line", () => {
    expect(buildQuestHooksPrompt({ partyLevels: [2], giver: null, location: null, theme: " a cult " }).concept).toBe("a cult");
    expect(buildQuestHooksPrompt({ partyLevels: [2], giver: null, location: null, theme: "" }).concept).toBe("Level 2 quest hooks");
  });
});
