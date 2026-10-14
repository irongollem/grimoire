import { describe, expect, it } from "vitest";
import { AI_DRAFT_SOURCE, sourceLabel, sourceLinkHost } from "./sourceLabel";

const titles = new Map([
  ["grimoire-bestiary", "Grimoire Bestiary"],
  ["tob", "Tome of Beasts"],
]);

describe("sourceLabel", () => {
  it("names a library book by its content_sources title, over a stale copy on the row", () => {
    expect(sourceLabel("grimoire-bestiary", "Grimoire Bestiary (homebrew)", titles)).toBe("Grimoire Bestiary");
  });

  it("shows a source the DM typed as written", () => {
    expect(sourceLabel("Monster Manual", null, titles)).toBe("Monster Manual");
  });

  it("uses the row's stored title when the key is not a known book", () => {
    expect(sourceLabel("deepm", "Deep Magic for 5th Edition", titles)).toBe("Deep Magic for 5th Edition");
  });

  it("falls back to the Open5e label, then the raw value", () => {
    expect(sourceLabel("tob2", null, titles)).toBe("Tome of Beasts 2");
    // v2 document keys, which imported classes and subclasses carry
    expect(sourceLabel("bfrd", null, titles)).toBe("Black Flag SRD");
    expect(sourceLabel("tdcs", null, titles)).toBe("Tal'Dorei Campaign Setting");
    expect(sourceLabel("open5e", null, titles)).toBe("Open5e Originals");
    expect(sourceLabel("mystery-book", "  ", titles)).toBe("mystery-book");
  });

  it("names nothing for a row with no source, or only the AI drafting marker", () => {
    expect(sourceLabel(null, null, titles)).toBeNull();
    expect(sourceLabel("  ", "Something", titles)).toBeNull();
    expect(sourceLabel(AI_DRAFT_SOURCE, null, titles)).toBeNull();
  });
});

describe("sourceLinkHost", () => {
  it("names the site a source link points at, or the text itself when it is not a url", () => {
    expect(sourceLinkHost("https://open5e.com/spells/fireball")).toBe("open5e.com");
    expect(sourceLinkHost("not a url")).toBe("not a url");
  });
});
