import { describe, expect, it } from "vitest";
import { groupMembers, groupOptions } from "./groups";
import { tie } from "./tieFixture";

const ties = [
  tie({ row_id: "1", source: "membership", type: "member_of", from_id: "a", to_kind: "faction", to_id: "thane", to_name: "House Thane" }),
  tie({ row_id: "2", source: "membership", type: "member_of", from_id: "b", to_kind: "faction", to_id: "thane", to_name: "House Thane" }),
  tie({ row_id: "3", source: "npc_home", type: "lives_in", from_id: "a", to_kind: "location", to_id: "crossing", to_name: "Thane's Crossing" }),
  tie({ row_id: "4", source: "pc_place", type: "is_at", from_kind: "party_member", from_id: "ilse", to_kind: "location", to_id: "crossing", to_name: "Thane's Crossing" }),
  tie({ row_id: "5", source: "patron_deity", type: "patron_deity", from_kind: "party_member", from_id: "ilse" }),
  tie({ row_id: "6" }), // a worships the Lady... brenna
  tie({ row_id: "7", type: "opposes", from_kind: "faction", from_id: "toll", from_name: "Toll-men", to_kind: "deity" }),
  tie({ row_id: "8", type: "ally_of", from_kind: "deity", from_id: "other", from_name: "Other god", to_kind: "deity" }),
];

describe("groupMembers", () => {
  it("gathers a faction's members", () => {
    expect([...groupMembers(ties, "faction:thane")].sort()).toEqual(["npc:a", "npc:b"]);
  });

  it("gathers a place's residents and the PCs there", () => {
    expect([...groupMembers(ties, "location:crossing")].sort()).toEqual(["npc:a", "party_member:ilse"]);
  });

  it("gathers a deity's faithful in faith only, not those who stand against her or other gods", () => {
    expect([...groupMembers(ties, "deity:lady")].sort()).toEqual(["npc:brenna", "party_member:ilse"]);
  });

  it("counts only memberships, and only ties to this very group", () => {
    const more = [
      ...ties,
      tie({ row_id: "9", type: "friend", from_id: "stranger", to_kind: "faction", to_id: "thane", to_name: "House Thane" }), // a link, not a membership
      tie({ row_id: "10", source: "membership", type: "member_of", from_id: "other", to_kind: "faction", to_id: "toll", to_name: "Toll-men" }),
    ];
    expect([...groupMembers(more, "faction:thane")].sort()).toEqual(["npc:a", "npc:b"]);
    expect([...groupMembers(more, "faction:toll")]).toEqual(["npc:other"]);
  });

  it("is empty for a kind that does not group", () => {
    expect(groupMembers(ties, "item:bell").size).toBe(0);
    expect(groupMembers(ties, "nonsense").size).toBe(0);
  });
});

describe("groupOptions ordering", () => {
  it("puts the bigger group first, and equal groups by name", () => {
    const m = (row: string, who: string, id: string, name: string) =>
      tie({ row_id: row, source: "membership", type: "member_of", from_id: who, to_kind: "faction", to_id: id, to_name: name });
    const options = groupOptions(
      [m("1", "a", "zeta", "Zeta"), m("2", "b", "alpha", "Alpha"), m("3", "c", "big", "Big"), m("4", "d", "big", "Big")],
      "faction",
    );
    expect(options.map((o) => o.name)).toEqual(["Big", "Alpha", "Zeta"]);
  });
});

describe("groupOptions", () => {
  it("lists the groups that gather someone, biggest first", () => {
    expect(groupOptions(ties, "faction")).toEqual([{ id: "thane", name: "House Thane", count: 2 }]);
    expect(groupOptions(ties, "location")).toEqual([{ id: "crossing", name: "Thane's Crossing", count: 2 }]);
    expect(groupOptions(ties, "deity")).toEqual([{ id: "lady", name: "The Drowned Lady", count: 2 }]);
  });
});
