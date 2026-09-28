import { describe, expect, it } from "vitest";
import { buildFrontmatter, dedupeFileName, joinSections, markdownSection, sanitizeFileName, yamlString } from "./vaultText";

describe("sanitizeFileName", () => {
  it("passes a clean name through unchanged", () => {
    expect(sanitizeFileName("Elminster")).toBe("Elminster");
  });

  it("strips characters unsafe in a file name", () => {
    expect(sanitizeFileName('Who/What:Where*Why?"<>|')).toBe("WhoWhatWhereWhy");
  });

  it("collapses whitespace left behind by stripped characters", () => {
    expect(sanitizeFileName("Waterdeep / Baldur's Gate")).toBe("Waterdeep Baldur's Gate");
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitizeFileName("  The Yawning Portal  ")).toBe("The Yawning Portal");
  });

  it("falls back to Untitled for null, undefined and blank input", () => {
    expect(sanitizeFileName(null)).toBe("Untitled");
    expect(sanitizeFileName(undefined)).toBe("Untitled");
    expect(sanitizeFileName("   ")).toBe("Untitled");
  });

  it("falls back to Untitled for a name that is entirely unsafe characters", () => {
    expect(sanitizeFileName("///???")).toBe("Untitled");
  });
});

describe("dedupeFileName", () => {
  it("returns the base name unchanged the first time it is used", () => {
    const used = new Set<string>();
    expect(dedupeFileName("Elminster", used)).toBe("Elminster");
  });

  it("appends (2), (3)... on repeated collisions", () => {
    const used = new Set<string>();
    expect(dedupeFileName("Goblin", used)).toBe("Goblin");
    expect(dedupeFileName("Goblin", used)).toBe("Goblin (2)");
    expect(dedupeFileName("Goblin", used)).toBe("Goblin (3)");
  });

  it("tracks collisions per Set instance, not globally", () => {
    const used = new Set<string>();
    expect(dedupeFileName("Goblin", used)).toBe("Goblin");
    const otherFolder = new Set<string>();
    expect(dedupeFileName("Goblin", otherFolder)).toBe("Goblin");
  });
});

describe("yamlString", () => {
  it("wraps a plain string in double quotes", () => {
    expect(yamlString("Elminster")).toBe('"Elminster"');
  });

  it("escapes embedded double quotes and backslashes", () => {
    expect(yamlString('the "Old Wizard" \\ mage')).toBe('"the \\"Old Wizard\\" \\\\ mage"');
  });

  it("escapes newlines, carriage returns and tabs", () => {
    expect(yamlString("a\nb\rc\td")).toBe('"a\\nb\\rc\\td"');
  });

  it("quotes a value that looks like a YAML bool/null without changing meaning", () => {
    expect(yamlString("No")).toBe('"No"');
    expect(yamlString("null")).toBe('"null"');
  });

  it("quotes a value containing a colon or leading dash safely", () => {
    expect(yamlString("Loot: the Hoard")).toBe('"Loot: the Hoard"');
    expect(yamlString("- a bullet-looking name")).toBe('"- a bullet-looking name"');
  });
});

describe("buildFrontmatter", () => {
  it("renders scalar string fields, quoted", () => {
    const fm = buildFrontmatter([["type", "npc"], ["grimoire_id", "abc-123"]]);
    expect(fm).toBe('---\ntype: "npc"\ngrimoire_id: "abc-123"\n---\n');
  });

  it("omits null and undefined fields entirely", () => {
    const fm = buildFrontmatter([["type", "npc"], ["race", null], ["occupation", undefined]]);
    expect(fm).toBe('---\ntype: "npc"\n---\n');
  });

  it("omits an empty-string scalar", () => {
    const fm = buildFrontmatter([["type", "npc"], ["race", ""]]);
    expect(fm).toBe('---\ntype: "npc"\n---\n');
  });

  it("renders numbers bare, unquoted", () => {
    const fm = buildFrontmatter([["level", 5]]);
    expect(fm).toBe("---\nlevel: 5\n---\n");
  });

  it("renders a non-empty list as a YAML block sequence", () => {
    const fm = buildFrontmatter([["tags", ["undead", "cursed"]]]);
    expect(fm).toBe('---\ntags:\n  - "undead"\n  - "cursed"\n---\n');
  });

  it("renders an empty list as key: [], not omitted", () => {
    const fm = buildFrontmatter([["tags", []]]);
    expect(fm).toBe("---\ntags: []\n---\n");
  });
});

describe("markdownSection", () => {
  it("renders a heading and trimmed body", () => {
    expect(markdownSection("Appearance", "  Tall and grey.  ")).toBe("## Appearance\n\nTall and grey.");
  });

  it("returns an empty string for a blank/whitespace-only body", () => {
    expect(markdownSection("Appearance", "")).toBe("");
    expect(markdownSection("Appearance", "   ")).toBe("");
  });

  it("returns an empty string for an absent (null) field", () => {
    expect(markdownSection("Summary", null)).toBe("");
  });
});

describe("joinSections", () => {
  it("joins non-empty parts with a blank line", () => {
    expect(joinSections(["First", "Second"])).toBe("First\n\nSecond");
  });

  it("drops empty, whitespace-only, null and undefined parts", () => {
    expect(joinSections(["First", "", "   ", null, undefined, "Second"])).toBe("First\n\nSecond");
  });

  it("returns an empty string when every part is empty", () => {
    expect(joinSections(["", null, undefined])).toBe("");
  });
});
