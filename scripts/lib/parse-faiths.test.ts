import { describe, expect, it } from "vitest";

import {
  PANTHEON_FOLK,
  PANTHEON_HEAVENLY,
  PANTHEON_LESSER,
  findPotentialDuplicates,
  isSkipHeading,
  normalizeName,
  parseClericDomains,
  parseFaith,
  parseFolkAndMargin,
  parsePreambleSuns,
  slug,
  splitFaithBlocks,
} from "./parse-faiths";

describe("isSkipHeading", () => {
  it("skips meta headings only; Folk and Margin Figures is now PARSED, not skipped", () => {
    expect(isSkipHeading("A Note for Players")).toBe(true);
    expect(isSkipHeading("Appendix C")).toBe(true);

    // Routed to parseFolkAndMargin by the CLI, not skipped at parser level
    expect(isSkipHeading("Folk and Margin Figures")).toBe(false);

    expect(isSkipHeading("The Saucer")).toBe(false);
    expect(isSkipHeading("The Bell-Mother")).toBe(false);
    expect(isSkipHeading("Old Tippet")).toBe(false);
  });
});

describe("splitFaithBlocks", () => {
  it("splits on top-level `## ` and preserves heading + body", () => {
    const md = `# FAITHS

preamble paragraph...

## The Hearth

body of hearth.

## The Bell-Mother

body of bell-mother.
`;
    const blocks = splitFaithBlocks(md);
    expect(blocks.length).toBe(2);
    expect(blocks[0]?.heading).toBe("The Hearth");
    expect(blocks[1]?.heading).toBe("The Bell-Mother");
    expect(blocks[0]?.body).toMatch(/body of hearth/);
  });
});

describe("parseClericDomains", () => {
  it("extracts a simple comma list", () => {
    const body = "**Cleric domains:** Life, Order, Peace. **Paladin Oath of X** sits naturally here.";
    const { domains } = parseClericDomains(body);
    expect(domains).toEqual(["Life", "Order", "Peace"]);
  });

  it("strips parenthetical asides and `**Paladin**` follow-ons", () => {
    const body = "**Cleric domains:** Trickery (the saint of gentle losses), Twilight (the threshold of steam). **Bards** and **Rogues** are the more usual servants.";
    const { domains } = parseClericDomains(body);
    expect(domains).toEqual(["Trickery", "Twilight"]);
  });

  it("handles the dual-faced Doors form: 'The Open — Life, Knowledge. The Close — Grave, Death (carefully).'", () => {
    const body = "**Cleric domains:** The Open — Life, Knowledge. The Close — Grave, Death (carefully). **Paladin Oath of Walk Through** sits naturally with the Close.";
    const { domains } = parseClericDomains(body);
    expect(domains.sort()).toEqual(["Death", "Grave", "Knowledge", "Life"]);
  });

  it("reports unknown tokens (homebrew names not in the ClericDomain enum) without crashing", () => {
    const body = "**Cleric domains:** Peace, Twilight, Hospitality. **Paladin Oath of Kindness**";
    const { domains, unknown } = parseClericDomains(body);
    expect(domains).toEqual(["Peace", "Twilight"]);
    expect(unknown).toContain("hospitality");
  });

  it("returns empty when no domains line is present", () => {
    expect(parseClericDomains("just a body.").domains).toEqual([]);
  });
});

describe("parseFaith — standard entry", () => {
  const body = `_Primary: Brewling. Honored variously by: Sippets, Marrows._

The patron of patience, of the slow circulation of the marmalade rivers.

A Long Steep cleric's healing works slowly and durably.

**Cleric domains:** Peace, Twilight, Mercy, Hospitality. **Paladin Oath of Kindness** is the natural pairing.

_Among other peoples:_ Sippets honor the Long Steep as "the Sleeping Tea".

---
`;

  it("returns a record with name + raw_heading from the `##` text", () => {
    const r = parseFaith("The Long Steep", body)!;
    expect(r.name).toBe("The Long Steep");
    expect(r.raw_heading).toBe("The Long Steep");
  });

  it("filters domains to valid ClericDomain enum values, dropping homebrew tokens", () => {
    const r = parseFaith("The Long Steep", body)!;
    // Peace, Twilight, Mercy are all in the enum; Hospitality is not and is dropped.
    expect(r.domains).toEqual(["Peace", "Twilight", "Mercy"]);
  });

  it("extracts portfolio summary from the first body sentence", () => {
    const r = parseFaith("The Long Steep", body)!;
    expect(r.portfolio).toMatch(/patron of patience/);
  });

  it("includes 'faith' + primary-race + honored-by + name-slug tags", () => {
    const r = parseFaith("The Long Steep", body)!;
    expect(r.tags).toContain("faith");
    expect(r.tags).toContain("primary-brewling");
    expect(r.tags).toContain("honored-by-sippets");
    expect(r.tags).toContain("honored-by-marrows");
    expect(r.tags).toContain("the-long-steep");
  });

  it("strips `---` trailers and the cleric-domains line from description", () => {
    const r = parseFaith("The Long Steep", body)!;
    expect(r.description.endsWith("---")).toBe(false);
    expect(r.description).not.toMatch(/\*\*Cleric domains:\*\*/);
  });

  it("preserves multi-paragraph body content in description", () => {
    const r = parseFaith("The Long Steep", body)!;
    expect(r.description).toMatch(/patron of patience/);
    expect(r.description).toMatch(/slowly and durably/);
    expect(r.description).toMatch(/Sleeping Tea/);
  });

  it("returns null for skip-headings (A Note / Appendix only — Folk and Margin is now routed elsewhere by the CLI)", () => {
    expect(parseFaith("A Note for Players", body)).toBeNull();
    expect(parseFaith("Appendix C: Songs", body)).toBeNull();
  });
});

describe("parseFaith — _Primary_ line variants", () => {
  it("handles the vague form (no people-list) — 'Rarely honored elsewhere.'", () => {
    const body = `_Primary: Wick. Rarely honored elsewhere._

The patron of those who burn for others.

**Cleric domains:** Light, Mercy.
`;
    const r = parseFaith("The Long Dark Mother", body)!;
    expect(r.tags).toContain("primary-wick");
    // No clean people-list, so no honored-by tags
    expect(r.tags.some((t) => t.startsWith("honored-by-"))).toBe(false);
  });

  it("strips parentheticals from primary race (e.g. 'Slip (uneasy devotion)' → 'slip')", () => {
    const body = `_Primary: Slip (uneasy devotion). Honored elsewhere mostly with fear._

The dissolution.

**Cleric domains:** Death, Grave.
`;
    const r = parseFaith("The Smudge", body)!;
    expect(r.tags).toContain("primary-slip");
    expect(r.tags.some((t) => t.includes("uneasy"))).toBe(false);
  });

  it("extracts honored-by list only from canonical 'Honored variously by:' form", () => {
    const body = `_Primary: Hatchling. Honored variously by: Sippets (Open), Marrows (Close)._

Twinned.

**Cleric domains:** Life.
`;
    const r = parseFaith("The Doors That Open and Close", body)!;
    expect(r.tags).toContain("primary-hatchling");
    expect(r.tags).toContain("honored-by-sippets");
    expect(r.tags).toContain("honored-by-marrows");
  });
});

describe("parseFaith — entry without _Primary_ line (The Saucer)", () => {
  const body = `The dish on which everything stands. Cracked along its rim.

Most peoples nod to the Saucer without naming it.

**Cleric domains:** Nature, Life, Order, Forge. **Druids** of any Circle may consider themselves saucer-druids.
`;
  it("still parses domains + description without a _Primary_ line", () => {
    const r = parseFaith("The Saucer", body)!;
    expect(r.domains).toEqual(["Nature", "Life", "Order", "Forge"]);
    expect(r.description).toMatch(/dish on which everything stands/);
    expect(r.tags).toContain("faith");
    expect(r.tags).toContain("the-saucer");
    expect(r.tags.some((t) => t.startsWith("primary-"))).toBe(false);
  });
});

describe("findPotentialDuplicates", () => {
  it("catches substring matches across faith names", () => {
    const existing = ["the bell-mother"];
    // "bell-mother" is a substring of "the bell-mother" — same class of bug as Petrichor.
    expect(findPotentialDuplicates("Bell-Mother", existing)).toEqual(["the bell-mother"]);
  });

  it("ignores exact matches (silent idempotent skip path)", () => {
    expect(findPotentialDuplicates("The Bell-Mother", ["the bell-mother"])).toEqual([]);
  });

  it("normalizes case + whitespace before comparing", () => {
    expect(normalizeName("THE LONG STEEP")).toBe(normalizeName("  the long steep "));
  });
});

describe("parseFaith — pantheon assignment", () => {
  const minimalBody = `_Primary: Sippet._\n\nThe patron of welcoming.\n\n**Cleric domains:** Light, Peace.\n`;

  it("defaults to Lesser Deities for unrecognized headings", () => {
    const r = parseFaith("The Bell-Mother", minimalBody)!;
    expect(r.pantheon).toBe(PANTHEON_LESSER);
  });

  it("overrides The Saucer → Heavenly Bodies", () => {
    const r = parseFaith("The Saucer", minimalBody)!;
    expect(r.pantheon).toBe(PANTHEON_HEAVENLY);
  });

  it("overrides Old Tippet → Folk and Margin Figures", () => {
    const r = parseFaith("Old Tippet", minimalBody)!;
    expect(r.pantheon).toBe(PANTHEON_FOLK);
  });
});

describe("parsePreambleSuns", () => {
  it("produces 3 Heavenly-Bodies sun records when preamble names the suns", () => {
    const text = `# FAITHS\n\nAbove all the lesser deities are the **Three Suns** — the gold, the rose, and the purple.\n\n## The Hearth\n...`;
    const suns = parsePreambleSuns(text);
    expect(suns.length).toBe(3);
    expect(suns.map((s) => s.name).sort()).toEqual(["Gold Sun", "Purple Sun", "Rose Sun"]);
    for (const s of suns) {
      expect(s.pantheon).toBe(PANTHEON_HEAVENLY);
      expect(s.description.length).toBeGreaterThan(50);
      expect(s.dm_notes).not.toBeNull();
      expect(s.tags).toContain("faith");
      expect(s.tags).toContain("heavenly-body");
      expect(s.tags).toContain("sun");
      // No `stub` tag — these have real content now
      expect(s.tags).not.toContain("stub");
    }
  });

  it("returns empty when preamble does NOT mention the canonical sun trio", () => {
    const text = `# DIFFERENT CAMPAIGN\n\nNo suns here.\n\n## Some Deity\n...`;
    expect(parsePreambleSuns(text)).toEqual([]);
  });

  it("does not look past the first `##` heading", () => {
    // Sun reference appears AFTER the first heading — should be ignored.
    const text = `# FAITHS\n\nNo suns here.\n\n## The Hearth\n\nthe gold, the rose, and the purple are mentioned in this entry but not in the preamble.`;
    expect(parsePreambleSuns(text)).toEqual([]);
  });
});

describe("parseFolkAndMargin", () => {
  const body = `These are not lesser deities exactly. They are figures the country talks about and sometimes prays to without quite admitting it.

**The Witch.** A figure everyone has heard of and very few have met. Sippet folk-tradition prays to the Witch for lost things.

**The Three Suns directly.** Some clerics serve a sun rather than a lesser deity. (This is meta and should be skipped.)

**The Stain.** There are priests who serve the Stain. They are extraordinarily rare.

---
`;

  it("produces one record per bold-lead paragraph", () => {
    const records = parseFolkAndMargin(body);
    expect(records.map((r) => r.name).sort()).toEqual(["The Stain", "The Witch"]);
  });

  it("skips the meta-paragraph 'The Three Suns directly' (covered by Heavenly Bodies)", () => {
    const records = parseFolkAndMargin(body);
    expect(records.find((r) => r.name === "The Three Suns directly")).toBeUndefined();
  });

  it("strips the bold-lead and trailing `---` from description", () => {
    const records = parseFolkAndMargin(body);
    const witch = records.find((r) => r.name === "The Witch")!;
    expect(witch.description.startsWith("A figure everyone")).toBe(true);
    expect(witch.description).not.toContain("**The Witch.**");
    expect(witch.description.endsWith("---")).toBe(false);
  });

  it("assigns Folk and Margin Figures pantheon + appropriate tags", () => {
    const records = parseFolkAndMargin(body);
    for (const r of records) {
      expect(r.pantheon).toBe(PANTHEON_FOLK);
      expect(r.tags).toContain("faith");
      expect(r.tags).toContain("folk-figure");
      expect(r.tags).toContain("session-zero-discussion");
    }
  });
});

describe("slug", () => {
  it("kebab-cases names with punctuation", () => {
    expect(slug("The Bell-Mother")).toBe("the-bell-mother");
    expect(slug("Old Tippet")).toBe("old-tippet");
    expect(slug("The Doors That Open and Close")).toBe("the-doors-that-open-and-close");
  });
});
