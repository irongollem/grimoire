import { describe, it, expect } from "vitest";
import { buildMonsterEmbedText, monsterEmbedHash, type EmbeddableMonster } from "./monsterEmbedText";

function makeMonster(overrides: Partial<EmbeddableMonster> = {}): EmbeddableMonster {
  return {
    name: "Owlbear",
    monster_type: "monstrosity",
    size: "Large",
    habitat: "Temperate forests",
    tags: ["forest", "ambush predator"],
    description: "A cross between a giant owl and a bear, ferocious and territorial.",
    stat_block: { challenge_rating: "3" },
    ...overrides,
  };
}

const NAME_ONLY: EmbeddableMonster = {
  name: "Owlbear",
  monster_type: null,
  size: null,
  habitat: null,
  tags: null,
  description: null,
  stat_block: null,
};

describe("buildMonsterEmbedText", () => {
  it("builds the complete string for a fully-populated monster", () => {
    expect(buildMonsterEmbedText(makeMonster())).toBe(
      "Owlbear. Large monstrosity, CR 3. forest, ambush predator. Temperate forests. " +
      "A cross between a giant owl and a bear, ferocious and territorial.",
    );
  });

  it("produces exactly the name clause for a name-only monster — no stray separators or dangling punctuation", () => {
    expect(buildMonsterEmbedText(NAME_ONLY)).toBe("Owlbear.");
  });

  // The size/type/CR clause: any of the three may be missing, and none of them
  // may leave a dangling comma, a lone "CR", or a double space.
  it.each<[string, Partial<EmbeddableMonster>, string]>([
    ["no size", { size: null }, "Owlbear. monstrosity, CR 3. "],
    ["no type", { monster_type: null }, "Owlbear. Large, CR 3. "],
    ["a blank type", { monster_type: "  " }, "Owlbear. Large, CR 3. "],
    ["no stat block", { stat_block: null }, "Owlbear. Large monstrosity. "],
    ["a stat block without a CR", { stat_block: {} }, "Owlbear. Large monstrosity. "],
    ["a blank CR", { stat_block: { challenge_rating: "  " } }, "Owlbear. Large monstrosity. "],
    ["only a CR", { size: null, monster_type: null }, "Owlbear. CR 3. "],
    ["none of the three", { size: null, monster_type: null, stat_block: null }, "Owlbear. "],
  ])("writes the clause with %s", (_label, over, start) => {
    const text = buildMonsterEmbedText(makeMonster(over));
    expect(text.startsWith(start)).toBe(true);
    expect(text).not.toMatch(/CR\s*[.,]|,\s*\.|\s{2,}/);
  });

  it.each<[string, Partial<EmbeddableMonster>, string]>([
    ["null tags", { tags: null }, "ambush predator"],
    ["no tags", { tags: [] }, "ambush predator"],
    ["only blank tags", { tags: ["  ", ""] }, "ambush predator"],
    ["no habitat", { habitat: null }, "Temperate"],
    ["a blank habitat", { habitat: "   " }, "Temperate"],
    ["no description", { description: null }, "cross between"],
    ["a blank description", { description: "  " }, "cross between"],
  ])("leaves the field out entirely for %s", (_label, over, gone) => {
    const text = buildMonsterEmbedText(makeMonster(over));
    expect(text).not.toContain(gone);
    expect(text).not.toMatch(/\s{2,}|\.\s*\.|,\s*\./);
  });

  it("flattens a Tiptap JSON description to plain text", () => {
    const tiptap = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "A cross between a giant owl and a bear." }],
        },
      ],
    });
    const text = buildMonsterEmbedText(makeMonster({ description: tiptap }));
    expect(text).toContain("A cross between a giant owl and a bear.");
    expect(text).not.toContain("{");
  });

  it("truncates a description longer than 500 characters at a word boundary, never mid-word", () => {
    const longDescription = Array.from({ length: 120 }, () => "alpha").join(" "); // 719 chars
    const text = buildMonsterEmbedText(makeMonster({ description: longDescription }));
    const descriptionPart = text.split("Temperate forests. ")[1]!;

    expect(descriptionPart.length).toBeLessThanOrEqual(500);
    // Every truncated word is complete — the cut lands exactly on "alpha" tokens.
    expect(descriptionPart.split(" ").every((word) => word === "alpha")).toBe(true);
    expect(longDescription.startsWith(descriptionPart)).toBe(true);
  });

  it("keeps a description of exactly 500 characters whole and drops the last word of one at 501", () => {
    const filler = "abcd ".repeat(99);
    const exact = `${filler}abcde`;
    const over = `${filler}abcdef`;
    expect([exact.length, over.length]).toEqual([500, 501]);
    expect(buildMonsterEmbedText(makeMonster({ description: exact })).endsWith(exact)).toBe(true);
    const cut = buildMonsterEmbedText(makeMonster({ description: over }));
    expect(cut).not.toContain("abcdef");
    expect(cut.endsWith("abcd")).toBe(true);
  });

  it("collapses runs of whitespace (newlines, tabs, repeated spaces) so output is stable regardless of source formatting", () => {
    const text = buildMonsterEmbedText(
      makeMonster({
        name: "Owlbear",
        habitat: "Temperate   forests",
        description: "A cross\nbetween  a giant\towl and a bear.",
      }),
    );
    expect(text).toContain("Temperate forests.");
    expect(text).toContain("A cross between a giant owl and a bear.");
    expect(text).not.toMatch(/\s{2,}/);
  });
});

describe("monsterEmbedHash", () => {
  it("is the lowercase hex SHA-256 of the text (FIPS 180-2 test vector for \"abc\"), so equal text skips a re-embed", async () => {
    expect(await monsterEmbedHash("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});
