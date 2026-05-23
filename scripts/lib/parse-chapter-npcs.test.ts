import { describe, expect, it } from "vitest";

import {
  applySidecar,
  findPotentialDuplicates,
  isSkipHeading,
  normalizeName,
  parseNpc,
  resolveLocationSpecs,
  slug,
  splitNpcBlocks,
  type NpcRecord,
  type SidecarConfig,
} from "./parse-chapter-npcs";

describe("slug", () => {
  it("lowercases and replaces non-alnum runs with single hyphens", () => {
    expect(slug("The Sugar Carnival")).toBe("the-sugar-carnival");
    expect(slug("  Late-Stage Advanced!  ")).toBe("late-stage-advanced");
    expect(slug("Sugarspun (Tuft)")).toBe("sugarspun-tuft");
    expect(slug("")).toBe("");
  });
});

describe("normalizeName", () => {
  it("is case-insensitive + whitespace-tolerant", () => {
    expect(normalizeName("Madame Petrichor")).toBe(normalizeName("  madame  PETRICHOR "));
    expect(normalizeName("Brittle")).not.toBe(normalizeName("Brittle (Reborn)"));
  });
});

describe("isSkipHeading", () => {
  it("filters non-NPC section headings used across Ch1-5 + prologue", () => {
    expect(isSkipHeading("Chapter Five — NPCs")).toBe(true);
    expect(isSkipHeading("Atlas Update Summary")).toBe(true);
    expect(isSkipHeading("NPC Atlas — Update Summary")).toBe(true);
    expect(isSkipHeading("Locus NPCs — Full Entries")).toBe(true);
    expect(isSkipHeading("Additional Locus NPCs (Background, Lightly Sketched)")).toBe(true);
    expect(isSkipHeading("Prologue — NPCs")).toBe(true);
    expect(isSkipHeading("Encountered in the Session")).toBe(true);
    expect(isSkipHeading("Available for Revisit")).toBe(true);

    expect(isSkipHeading("Brittle")).toBe(false);
    expect(isSkipHeading("Madame Petrichor (Terminal Entry)")).toBe(false);
    expect(isSkipHeading("Brine (Glissade Junior)")).toBe(false);
  });
});

describe("presence-check rule — only `## NAME` top-level headings become NPCs", () => {
  // Regression: during audit of past imports we found 7 names that had been
  // inserted by the ad-hoc Python Ch4 importer despite only appearing in the
  // source as inline `**Name**` bold within prose paragraphs (not as section
  // headers). The TS importer must NOT do this — NPCs need their own `##`
  // heading or they're not extracted.
  const md = `# Title

## Real Npc Alpha
**Race:** Goliath

### Visual
Tall.

## Real Npc Beta
**Race:** Halfling

### Visual
Short.

### The Channel Camp's other Slips

Three adult Slips at the Channel Camp: **Reed** (background), **Pour** (background), and **Sieve** (background).

### Vela (Holder's wife) and Vow (Holder's daughter)

Both walked. **Vela** four years ago; **Vow** last summer.

- **Inline Reference Name** — a cross-reference, not an NPC entry.
`;

  it("extracts only the two `## NAME` top-level entries", () => {
    const blocks = splitNpcBlocks(md);
    const names = blocks.map((b) => b.heading);
    expect(names).toEqual(["Real Npc Alpha", "Real Npc Beta"]);
  });

  it("does NOT extract `### NAME` sub-headings as separate NPCs", () => {
    const blocks = splitNpcBlocks(md);
    const names = blocks.map((b) => b.heading);
    expect(names).not.toContain("The Channel Camp's other Slips");
    expect(names).not.toContain("Vela (Holder's wife) and Vow (Holder's daughter)");
  });

  it("does NOT extract inline **Name** bold names from body prose", () => {
    const blocks = splitNpcBlocks(md);
    const names = blocks.map((b) => b.heading);
    for (const inlineName of ["Reed", "Pour", "Sieve", "Vela", "Vow", "Inline Reference Name"]) {
      expect(names).not.toContain(inlineName);
    }
  });
});

describe("splitNpcBlocks", () => {
  it("splits on top-level `## ` and preserves heading + body separation", () => {
    const md = `# Title

## Spangle
**Race:** Sugarspun

### Visual
Tall.

## Glissade
**Race:** Sugarspun

### Visual
Seated.
`;
    const blocks = splitNpcBlocks(md);
    expect(blocks.length).toBe(2);
    expect(blocks[0]?.heading).toBe("Spangle");
    expect(blocks[1]?.heading).toBe("Glissade");
    expect(blocks[0]?.body).toMatch(/Race:/);
    expect(blocks[1]?.body).toMatch(/Seated\./);
  });
});

describe("parseNpc — Ch5 standard format", () => {
  const body = `**ID:** spangle_stagemistress
**Race:** Sugarspun (Tuft)
**Stage:** Middle-stage
**Apparent age:** 40s
**Role:** Stagemistress of the Sugar Carnival.

### Visual

Tall, cream coat. Glitter on the cuffs.

### Personality

Articulate, warm, observant, deliberate.

### Background

Born in the Carnival. Trained as a juggler.

### Speech and Mannerisms

Deliberate stage voice.

### Lens Variations

**Bright Lens.** Warm host.
**Deep Lens.** Antibody.

### Emotional Core

_She believes the carnival is a kindness._

### Encounter Scenes

- **Scene One.** Welcome speech.

### Cross-Chapter Carries

- Brass token to Ch9.

---
`;

  it("extracts metadata fields", () => {
    const npc = parseNpc("Spangle", body, 5, "carnival");
    expect(npc).not.toBeNull();
    expect(npc!.name).toBe("Spangle");
    expect(npc!.race).toBe("Sugarspun (Tuft)");
    expect(npc!.occupation).toBe("Stagemistress of the Sugar Carnival.");
  });

  it("extracts section content", () => {
    const npc = parseNpc("Spangle", body, 5, "carnival")!;
    expect(npc.appearance).toBe("Tall, cream coat. Glitter on the cuffs.");
    expect(npc.personality).toBe("Articulate, warm, observant, deliberate.");
    expect(npc.backstory).toBe("Born in the Carnival. Trained as a juggler.");
  });

  it("synthesizes notes with **Emotional Core** lead", () => {
    const npc = parseNpc("Spangle", body, 5, "carnival")!;
    expect(npc.notes.startsWith("**Emotional Core**")).toBe(true);
    expect(npc.notes).toMatch(/\*\*Stage\*\*/);
    expect(npc.notes).toMatch(/\*\*Apparent age\*\*/);
    expect(npc.notes).toMatch(/\*\*Speech and Mannerisms\*\*/);
    expect(npc.notes).toMatch(/\*\*Lens Variations\*\*/);
    expect(npc.notes).toMatch(/\*\*Encounter Scenes\*\*/);
    expect(npc.notes).toMatch(/\*\*Cross-Chapter Carries\*\*/);
  });

  it("strips trailing `---` from sections", () => {
    const npc = parseNpc("Spangle", body, 5, "carnival")!;
    expect(npc.notes.endsWith("---")).toBe(false);
  });

  it("generates baseline tags from metadata", () => {
    const npc = parseNpc("Spangle", body, 5, "carnival")!;
    expect(npc.tags).toContain("chapter-5");
    expect(npc.tags).toContain("sugarspun");
    expect(npc.tags).toContain("tuft");
    expect(npc.tags).toContain("carnival");
  });

  it("returns null for skip-headings", () => {
    expect(parseNpc("Chapter Five — NPCs", body, 5, null)).toBeNull();
    expect(parseNpc("Atlas Update Summary", body, 5, null)).toBeNull();
  });
});

describe("parseNpc — multi-paragraph sections", () => {
  // Regression: an earlier version used the regex `m` flag, which made `$` in
  // the lookahead match end-of-line rather than end-of-string. Non-greedy
  // captures truncated at the first paragraph break.
  const body = `**Race:** Test

### Visual

First paragraph of the visual section.

Second paragraph, after a blank line.

Third paragraph, still in Visual.

### Personality

P1.

P2.
`;

  it("captures all paragraphs in a single section, not just the first", () => {
    const npc = parseNpc("Subject", body, 6, null)!;
    expect(npc.appearance).toMatch(/First paragraph/);
    expect(npc.appearance).toMatch(/Second paragraph/);
    expect(npc.appearance).toMatch(/Third paragraph/);
    expect(npc.personality).toMatch(/P1\./);
    expect(npc.personality).toMatch(/P2\./);
  });

  it("preserves blank-line separators between paragraphs", () => {
    const npc = parseNpc("Subject", body, 6, null)!;
    expect(npc.appearance).toContain("\n\n");
  });
});

describe("parseNpc — Ch4 tolerance (no meta lines, Visual + Appearance split)", () => {
  const body = `### Visual
Pale green wrap. Mended.

### Personality
Soft. Distracted.

### Appearance
A small leather apron over the wrap.

### Background
Born at Brewer's Brand.

### Emotional Core
_He walked away from a kindly contract._
`;

  it("works without **Race:/Stage:/Role:** meta lines", () => {
    const npc = parseNpc("Bramble", body, 4, null)!;
    expect(npc.race).toBe("");
    expect(npc.occupation).toBe("");
    expect(npc.personality).toBe("Soft. Distracted.");
    expect(npc.backstory).toBe("Born at Brewer's Brand.");
  });

  it("concatenates Visual + Appearance sections", () => {
    const npc = parseNpc("Bramble", body, 4, null)!;
    expect(npc.appearance).toContain("Pale green wrap");
    expect(npc.appearance).toContain("leather apron");
  });

  it("tolerates parenthetical heading suffixes", () => {
    const bodyWithParens = body.replace("### Personality", "### Personality (When He Was at the Camp)");
    const npc = parseNpc("Drift", bodyWithParens, 4, null)!;
    expect(npc.personality).toBe("Soft. Distracted.");
  });
});

describe("applySidecar", () => {
  function freshRecord(): NpcRecord {
    return {
      name: "Brittle",
      raw_heading: "Brittle",
      race: "Sugarspun (Tuft)",
      occupation: "Right-side lemonade-girl.",
      appearance: "",
      personality: "",
      backstory: "",
      notes: "",
      status: "alive",
      relationship: "indifferent",
      relevance: 3,
      tags: ["chapter-5", "sugarspun", "tuft"],
      location_key: null,
    };
  }

  it("applies status, relationship, relevance, tag replacement, display_name", () => {
    const r = freshRecord();
    const cfg: SidecarConfig = {
      npcs: {
        Brittle: {
          status: "alive",
          relationship: "helpful",
          relevance: 4,
          tags: ["chapter-5", "sugarspun", "child", "bow-keeper"],
          location: "carnival",
        },
      },
    };
    applySidecar([r], cfg);
    expect(r.relationship).toBe("ally");
    expect(r.relevance).toBe(4);
    expect(r.tags).toEqual(["chapter-5", "sugarspun", "child", "bow-keeper"]);
    expect(r.location_key).toBe("carnival");
  });

  it("merges extra_tags without dupes", () => {
    const r = freshRecord();
    applySidecar([r], { npcs: { Brittle: { extra_tags: ["new-tag", "sugarspun"] } } });
    expect(r.tags).toContain("new-tag");
    expect(r.tags.filter((t) => t === "sugarspun").length).toBe(1);
  });

  it("renames via display_name and looks up by raw_heading", () => {
    const r = freshRecord();
    r.raw_heading = "Madame Petrichor (Terminal Entry)";
    r.name = "Madame Petrichor (Terminal Entry)";
    const cfg: SidecarConfig = {
      npcs: {
        "Madame Petrichor (Terminal Entry)": { display_name: "Madame Petrichor", relevance: 5 },
      },
    };
    applySidecar([r], cfg);
    expect(r.name).toBe("Madame Petrichor");
    expect(r.relevance).toBe(5);
  });
});

describe("findPotentialDuplicates", () => {
  // Regression: yesterday's Ch5 import created a "Madame Petrichor" NPC even
  // though an older "Madame Petrichor & Cinder" was already in the DB. Exact
  // and normalized name matches both missed it; substring detection catches it.
  it("catches the Petrichor case (candidate is substring of existing)", () => {
    const existing = ["madame petrichor & cinder"].map(normalizeName);
    expect(findPotentialDuplicates("Madame Petrichor", existing)).toEqual([
      "madame petrichor & cinder",
    ]);
  });

  it("catches the reverse case (existing is substring of candidate)", () => {
    const existing = ["petrichor"];
    expect(findPotentialDuplicates("Madame Petrichor", existing)).toEqual(["petrichor"]);
  });

  it("ignores exact matches (caller handles those as silent idempotent skip)", () => {
    const existing = ["madame petrichor"];
    expect(findPotentialDuplicates("Madame Petrichor", existing)).toEqual([]);
  });

  it("returns empty for unrelated names", () => {
    const existing = ["brittle", "spangle", "glissade"].map(normalizeName);
    expect(findPotentialDuplicates("Marzipane", existing)).toEqual([]);
  });

  it("does not false-positive on common short prefixes", () => {
    // "Bract" and "Bramble" share the prefix "br" but neither is a substring
    // of the other.
    const existing = ["bract"];
    expect(findPotentialDuplicates("Bramble", existing)).toEqual([]);
  });
});

describe("resolveLocationSpecs", () => {
  it("applies default parent + type when sidecar omits them", () => {
    const cfg: SidecarConfig = {
      locations: [{ key: "carnival", name: "The Sugar Carnival" }],
    };
    const specs = resolveLocationSpecs(cfg, "Sothery");
    expect(specs.length).toBe(1);
    expect(specs[0]!.parent_name).toBe("Sothery");
    expect(specs[0]!.type).toBe("other"); // default fallback
    expect(specs[0]!.tags).toEqual([]);
  });

  it("respects sidecar-supplied type and parent", () => {
    const cfg: SidecarConfig = {
      locations: [
        { key: "carnival", name: "The Sugar Carnival", type: "town", parent_name: "Sothery", tags: ["a", "b"] },
      ],
    };
    const specs = resolveLocationSpecs(cfg, "DefaultParent");
    expect(specs[0]!.type).toBe("town");
    expect(specs[0]!.parent_name).toBe("Sothery");
    expect(specs[0]!.tags).toEqual(["a", "b"]);
  });
});
