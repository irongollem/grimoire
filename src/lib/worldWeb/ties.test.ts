import { describe, expect, it } from "vitest";
import { asConnection, groupTies, isEditableTie, isLine, tieFamily, tieWord, tieWordFrom } from "./ties";
import { tie } from "./tieFixture";

describe("tieWord", () => {
  it("reads a link forward from its from end and backward from its to end", () => {
    const t = tie({});
    expect(tieWord(t, "from")).toBe("worships");
    expect(tieWord(t, "to")).toBe("worshipped by");
    expect(tieWordFrom(t, "deity:lady")).toBe("worshipped by");
    expect(tieWordFrom(t, "npc:brenna")).toBe("worships");
  });

  it("reads a record in the catalogue's words", () => {
    const t = tie({ source: "patron_deity", type: "patron_deity", from_kind: "party_member", from_id: "ilse" });
    expect(tieWord(t, "from")).toBe("patron deity");
    expect(tieWord(t, "to")).toBe("patron of");
  });

  it("reads a quest from the quest's own records", () => {
    const t = tie({ source: "quest", type: "quest_giver", from_kind: "quest", from_id: "q", to_kind: "npc", to_id: "harl" });
    expect(tieWord(t, "from")).toBe("given by");
    expect(tieWord(t, "to")).toBe("gave this quest");
  });

  it("falls back to the key's words for a type the catalogue lacks", () => {
    expect(tieWord(tie({ type: "mystery_tie" }), "from")).toBe("mystery tie");
  });
});

describe("tieFamily", () => {
  it("is the type's family for a link, kin for kin and record for every other home", () => {
    expect(tieFamily(tie({}))).toBe("faith");
    expect(tieFamily(tie({ type: "opposes", from_kind: "faction", to_kind: "deity" }))).toBe("enmity");
    expect(tieFamily(tie({ source: "kin", type: "sibling_of", from_kind: "npc", to_kind: "npc" }))).toBe("kin");
    expect(tieFamily(tie({ source: "membership", type: "member_of", to_kind: "faction" }))).toBe("record");
    expect(tieFamily(tie({ source: "quest", type: "quest_ref", from_kind: "quest", to_kind: "npc" }))).toBe("record");
  });
});

describe("isLine and isEditableTie", () => {
  it("draws links and kin at rest and leaves records to group", () => {
    expect(isLine(tie({}))).toBe(true);
    expect(isLine(tie({ source: "kin" }))).toBe(true);
    expect(isLine(tie({ source: "membership" }))).toBe(false);
  });

  it("does not offer to edit a quest's ties", () => {
    expect(isEditableTie(tie({ source: "quest" }))).toBe(false);
    expect(isEditableTie(tie({ source: "inventory" }))).toBe(true);
  });
});

describe("asConnection", () => {
  it("reads outward from the from end and inward from the to end", () => {
    const t = tie({ told: "Every dawn" });
    const out = asConnection(t, "npc:brenna");
    expect(out).toMatchObject({ outward: true, other_kind: "deity", other_id: "lady", other_name: "The Drowned Lady", told: "Every dawn" });
    expect(out.note).toBeNull();
    expect(asConnection(tie({ note: "Seen at the shrine" }), "npc:brenna").note).toBe("Seen at the shrine");
    const back = asConnection(t, "deity:lady");
    expect(back).toMatchObject({ outward: false, other_kind: "npc", other_id: "brenna", other_name: "Brenna Ashe" });
  });
});

describe("groupTies", () => {
  const ties = [
    tie({ row_id: "1" }),
    tie({ row_id: "2", from_id: "ama", from_name: "Sister Ama" }),
    tie({ row_id: "3", type: "serves", from_id: "ilse", from_name: "Ilse" }),
    tie({ row_id: "4", type: "opposes", from_kind: "faction", from_id: "toll", from_name: "Toll-men" }),
    tie({ row_id: "5", type: "friend", from_id: "brenna", to_kind: "npc", to_id: "ama", to_name: "Sister Ama" }),
  ];

  it("groups the subject's ties by the word read from the subject, largest first", () => {
    const groups = groupTies(ties, "deity:lady");
    expect(groups.map((g) => [g.word, g.items.map((i) => i.name)])).toEqual([
      ["worshipped by", ["Brenna Ashe", "Sister Ama"]],
      ["opposed by", ["Toll-men"]],
      ["served by", ["Ilse"]],
    ]);
  });

  it("reads a tie the subject holds outward with its own word", () => {
    const groups = groupTies(ties, "npc:brenna");
    expect(groups.find((g) => g.word === "worships")?.items[0]).toMatchObject({ key: "deity:lady", kind: "deity" });
    expect(groups.find((g) => g.word === "friend of")?.items[0]?.name).toBe("Sister Ama");
  });

  it("ignores ties that do not touch the subject", () => {
    expect(groupTies(ties, "item:bell")).toEqual([]);
  });
});
