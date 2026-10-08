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

  it("omits the size/type/CR clause entirely when size is missing (no dangling comma)", () => {
    const text = buildMonsterEmbedText(makeMonster({ size: null }));
    expect(text).toBe(
      "Owlbear. monstrosity, CR 3. forest, ambush predator. Temperate forests. " +
      "A cross between a giant owl and a bear, ferocious and territorial.",
    );
  });

  it("omits the size/type/CR clause entirely when monster_type is missing", () => {
    const text = buildMonsterEmbedText(makeMonster({ monster_type: null }));
    expect(text).toContain("Owlbear. Large, CR 3.");
  });

  it("never emits a dangling 'CR .' when challenge_rating is missing", () => {
    const text = buildMonsterEmbedText(makeMonster({ stat_block: null }));
    expect(text).not.toContain("CR .");
    expect(text).not.toContain("CR ,");
    expect(text).toContain("Owlbear. Large monstrosity.");
  });

  it("never emits a dangling 'CR .' when stat_block is present but challenge_rating is absent", () => {
    const text = buildMonsterEmbedText(makeMonster({ stat_block: {} }));
    expect(text).not.toContain("CR .");
    expect(text).toContain("Owlbear. Large monstrosity.");
  });

  it("emits a CR-only clause when size and type are both missing but CR is present", () => {
    const text = buildMonsterEmbedText(makeMonster({ size: null, monster_type: null }));
    expect(text).toBe(
      "Owlbear. CR 3. forest, ambush predator. Temperate forests. " +
      "A cross between a giant owl and a bear, ferocious and territorial.",
    );
  });

  it("omits the size/type/CR clause entirely when size, type and CR are all missing", () => {
    const text = buildMonsterEmbedText(makeMonster({ size: null, monster_type: null, stat_block: null }));
    expect(text).toBe(
      "Owlbear. forest, ambush predator. Temperate forests. " +
      "A cross between a giant owl and a bear, ferocious and territorial.",
    );
  });

  it("omits the tags clause entirely when tags is null", () => {
    const text = buildMonsterEmbedText(makeMonster({ tags: null }));
    expect(text).toBe(
      "Owlbear. Large monstrosity, CR 3. Temperate forests. " +
      "A cross between a giant owl and a bear, ferocious and territorial.",
    );
  });

  it("omits the tags clause entirely when tags is an empty array", () => {
    const text = buildMonsterEmbedText(makeMonster({ tags: [] }));
    expect(text).not.toContain("  ");
    expect(text).toBe(
      "Owlbear. Large monstrosity, CR 3. Temperate forests. " +
      "A cross between a giant owl and a bear, ferocious and territorial.",
    );
  });

  it("preserves tag order as given, never re-sorted", () => {
    const text = buildMonsterEmbedText(makeMonster({ tags: ["zebra", "ambush predator", "aardvark"] }));
    expect(text).toContain("zebra, ambush predator, aardvark.");
  });

  it("omits the habitat clause entirely when habitat is missing", () => {
    const text = buildMonsterEmbedText(makeMonster({ habitat: null }));
    expect(text).toBe(
      "Owlbear. Large monstrosity, CR 3. forest, ambush predator. " +
      "A cross between a giant owl and a bear, ferocious and territorial.",
    );
  });

  it("omits the description entirely when it is missing", () => {
    const text = buildMonsterEmbedText(makeMonster({ description: null }));
    expect(text).toBe("Owlbear. Large monstrosity, CR 3. forest, ambush predator. Temperate forests.");
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

  it("is deterministic — the same input always produces byte-identical output", () => {
    const monster = makeMonster();
    expect(buildMonsterEmbedText(monster)).toBe(buildMonsterEmbedText(makeMonster()));
  });
});

describe("monsterEmbedHash", () => {
  it("is stable for identical text", async () => {
    const text = buildMonsterEmbedText(makeMonster());
    const [first, second] = await Promise.all([monsterEmbedHash(text), monsterEmbedHash(text)]);
    expect(first).toBe(second);
  });

  it("differs for different text", async () => {
    const a = await monsterEmbedHash(buildMonsterEmbedText(makeMonster()));
    const b = await monsterEmbedHash(buildMonsterEmbedText(makeMonster({ name: "Displacer Beast" })));
    expect(a).not.toBe(b);
  });

  it("returns lowercase hex SHA-256 (64 chars)", async () => {
    const hash = await monsterEmbedHash("Owlbear.");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
