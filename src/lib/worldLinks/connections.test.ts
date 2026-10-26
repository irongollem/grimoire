import { describe, expect, it } from "vitest";
import { connectionFamily, connectionWord, groupFor, linkInsert, typeChoices } from "./connections";

describe("connectionWord", () => {
  it("reads a link from whichever end is on screen", () => {
    expect(connectionWord({ type: "worships", outward: true, other_kind: "deity" }, "npc")).toBe("worships");
    expect(connectionWord({ type: "worships", outward: false, other_kind: "npc" }, "deity")).toBe("worshipped by");
  });

  it("reads one stored direction both ways between two people", () => {
    expect(connectionWord({ type: "mentor_of", outward: true, other_kind: "npc" }, "npc")).toBe("mentor of");
    expect(connectionWord({ type: "mentor_of", outward: false, other_kind: "npc" }, "npc")).toBe("apprentice of");
  });

  it("reads records and quest records", () => {
    expect(connectionWord({ type: "lives_in", outward: true, other_kind: "location" }, "npc")).toBe("lives in");
    expect(connectionWord({ type: "lives_in", outward: false, other_kind: "npc" }, "location")).toBe("home of");
    expect(connectionWord({ type: "quest_giver", outward: false, other_kind: "quest" }, "npc")).toBe("gave this quest");
  });
});

describe("connectionFamily", () => {
  it("colours a link by its type and a record as a record", () => {
    expect(connectionFamily({ source: "link", type: "rival", outward: true, other_kind: "npc" }, "npc")).toBe("enmity");
    expect(connectionFamily({ source: "membership", type: "member_of", outward: true, other_kind: "faction" }, "npc")).toBe("record");
  });
});

describe("typeChoices", () => {
  it("offers a person both directions of an asymmetric type, and a symmetric one once", () => {
    const choices = typeChoices("npc", "npc");
    expect(choices.filter((c) => c.key === "friend")).toHaveLength(1);
    expect(choices.filter((c) => c.key === "mentor_of").map((c) => c.word).sort()).toEqual(["apprentice of", "mentor of"]);
    expect(choices.filter((c) => c.key === "parent_of").map((c) => c.word).sort()).toEqual(["child of", "parent of"]);
    expect(choices.filter((c) => c.key === "spouse_of")).toHaveLength(1);
  });

  it("reads a pair from its `to` side when the screen is that side", () => {
    const choices = typeChoices("location", "faction");
    expect(choices.find((c) => c.key === "controls")).toMatchObject({ word: "controlled by", subjectIsFrom: false });
    expect(choices.find((c) => c.key === "seat")).toMatchObject({ word: "seat of", home: "seat" });
  });

  it("offers a record only to the kinds that can hold it", () => {
    expect(typeChoices("npc", "location").some((c) => c.key === "lives_in")).toBe(true);
    expect(typeChoices("party_member", "location").some((c) => c.key === "lives_in")).toBe(false);
    expect(typeChoices("party_member", "deity").some((c) => c.key === "patron_deity")).toBe(true);
    expect(typeChoices("npc", "deity").some((c) => c.key === "patron_deity")).toBe(false);
  });

  it("offers a person and a faction nothing but membership", () => {
    expect(typeChoices("npc", "faction").map((c) => c.key)).toEqual(["member_of"]);
  });
});

describe("linkInsert", () => {
  it("writes the catalogue's direction whichever end is on screen", () => {
    const fromSheet = linkInsert({ kind: "deity", id: "d1" }, { kind: "npc", id: "n1" }, { key: "worships", subjectIsFrom: false });
    expect(fromSheet).toEqual({ from_kind: "npc", to_kind: "deity", type: "worships", from_npc_id: "n1", to_deity_id: "d1" });
  });
});

describe("groupFor", () => {
  it("groups people together whatever kind of person", () => {
    expect(groupFor("npc")).toBe("people");
    expect(groupFor("party_member")).toBe("people");
    expect(groupFor("quest")).toBe("quests");
  });
});
