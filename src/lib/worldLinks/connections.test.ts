import { describe, expect, it } from "vitest";
import type { Connection, WorldLink } from "@/types/connections.types";
import { connectionFamily, connectionWord, groupByKind, groupFor, linkInsert, otherEnd, peopleOf, typeChoices } from "./connections";

const conn = (over: Partial<Connection>): Connection => ({
  source: "link",
  row_id: "r",
  type: "friend",
  outward: true,
  other_kind: "npc",
  other_id: "x",
  other_name: "X",
  other_image: null,
  note: null,
  told: null,
  player_visible_to: null,
  ai_provenance: null,
  role: null,
  status: null,
  ...over,
});

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

  it("calls a link of a type the catalogue does not know a bond", () => {
    expect(connectionFamily({ source: "link", type: "no_such_type", outward: true, other_kind: "npc" }, "npc")).toBe("bond");
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

describe("linkInsert (subject at the from end)", () => {
  it("writes the subject as the from end when the choice stores it that way", () => {
    const row = linkInsert({ kind: "npc", id: "n1" }, { kind: "deity", id: "d1" }, { key: "worships", subjectIsFrom: true });
    expect(row).toEqual({ from_kind: "npc", to_kind: "deity", type: "worships", from_npc_id: "n1", to_deity_id: "d1" });
  });
});

describe("otherEnd", () => {
  const link = { from_kind: "npc", from_id: "n1", to_kind: "deity", to_id: "d1" } as WorldLink;
  it("names the end that is not the one asking", () => {
    expect(otherEnd(link, "n1")).toEqual({ kind: "deity", id: "d1" });
    expect(otherEnd(link, "d1")).toEqual({ kind: "npc", id: "n1" });
  });
});

describe("peopleOf", () => {
  const rows = [
    conn({ source: "npc_home", row_id: "1", other_kind: "npc" }),
    conn({ source: "pc_place", row_id: "2", other_kind: "party_member" }),
    conn({ source: "link", row_id: "3", other_kind: "npc" }), // a link is not a resident
    conn({ source: "membership", row_id: "4", other_kind: "npc" }),
    conn({ source: "membership", row_id: "5", other_kind: "faction" }), // a faction's tie to another faction is not a member
    conn({ source: "npc_home", row_id: "6", other_kind: "item" }),
  ];
  it("takes a place's residents and the PCs there, not its links", () => {
    expect(peopleOf("location", rows).map((c) => c.row_id)).toEqual(["1", "2"]);
  });
  it("takes a faction's memberships, and only those held by people", () => {
    expect(peopleOf("faction", rows).map((c) => c.row_id)).toEqual(["4"]);
  });
});

describe("groupByKind", () => {
  it("orders groups as every sheet does, puts a PC with the people, and leaves empty groups out", () => {
    const items = [
      { id: "q", kind: "quest" as const },
      { id: "pc", kind: "party_member" as const },
      { id: "i", kind: "item" as const },
      { id: "n", kind: "npc" as const },
    ];
    const grouped = groupByKind(items, (i) => i.kind);
    expect(grouped.map((g) => [g.group, g.items.map((i) => i.id)])).toEqual([
      ["people", ["pc", "n"]],
      ["items", ["i"]],
      ["quests", ["q"]],
    ]);
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
