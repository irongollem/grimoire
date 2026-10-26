import { describe, expect, it } from "vitest";
import { parseTieQuery, rowMatchesTie } from "./tieQuery";

describe("parseTieQuery", () => {
  it("reads 'who worships X' as the worshippers of X", () => {
    const parsed = parseTieQuery("who worships the drowned lady");
    expect(parsed?.name).toBe("drowned lady");
    expect(parsed?.words.filter((w) => w.key === "worships")).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "worships", word: "worships", outward: false })]),
    );
  });

  it("reads 'who controls X' with the forward spelling", () => {
    const parsed = parseTieQuery("who controls the crossing");
    expect(parsed?.name).toBe("crossing");
    expect(parsed?.words).toEqual([{ key: "controls", word: "controls", outward: false, symmetric: false }]);
  });

  it("reads 'members of X' through the plural and the particle", () => {
    const parsed = parseTieQuery("members of the toll-men");
    expect(parsed?.name).toBe("toll-men");
    expect(parsed?.words).toEqual([{ key: "member_of", word: "member of", outward: false, symmetric: false }]);
  });

  it("reads a possessive plural: harl's rivals", () => {
    const parsed = parseTieQuery("harl's rivals");
    expect(parsed?.name).toBe("harl");
    expect(parsed?.words.map((w) => w.key)).toContain("rival");
    expect(parsed?.words.find((w) => w.key === "rival")?.symmetric).toBe(true);
  });

  it("reads the reverse spelling as the other direction", () => {
    const parsed = parseTieQuery("apprentice of harl");
    expect(parsed?.name).toBe("harl");
    expect(parsed?.words).toEqual([{ key: "mentor_of", word: "apprentice of", outward: true, symmetric: false }]);
  });

  it("prefers the longest catalogue phrase", () => {
    const parsed = parseTieQuery("who is seen as a rival by the guild");
    expect(parsed?.words.map((w) => w.word)).toEqual(["seen as a rival by"]);
    expect(parsed?.name).toBe("guild");
  });

  it("is null with no catalogue word, or no name", () => {
    expect(parseTieQuery("goblin")).toBeNull();
    expect(parseTieQuery("harl")).toBeNull();
    expect(parseTieQuery("members")).toBeNull();
    expect(parseTieQuery("who worships")).toBeNull();
  });

  it("does not read 'where' as a tie", () => {
    expect(parseTieQuery("where harl")).toBeNull();
  });
});

describe("rowMatchesTie", () => {
  const words = [
    { key: "worships", word: "worships", outward: false, symmetric: false },
    { key: "rival", word: "rival of", outward: false, symmetric: true },
  ];
  it("checks the type and the direction", () => {
    expect(rowMatchesTie({ type: "worships", outward: false }, words)?.word).toBe("worships");
    expect(rowMatchesTie({ type: "worships", outward: true }, words)).toBeNull();
    expect(rowMatchesTie({ type: "rival", outward: true }, words)?.word).toBe("rival of");
    expect(rowMatchesTie({ type: "friend", outward: false }, words)).toBeNull();
  });
});
