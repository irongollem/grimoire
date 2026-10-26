import { describe, expect, it } from "vitest";
import {
  COLLAPSE_AT,
  groupConnections,
  homeRoute,
  kinRelationFor,
  membershipEnds,
  offeredRoles,
  oppositeWord,
  splitChoices,
} from "@/components/connections/connectionRows";
import { typeChoices } from "@/lib/worldLinks/connections";
import type { Connection } from "@/types/connections.types";

function conn(over: Partial<Connection>): Connection {
  return {
    source: "link",
    row_id: "r1",
    type: "friend",
    outward: true,
    other_kind: "npc",
    other_id: "n1",
    other_name: "Harl",
    other_image: null,
    note: "",
    told: "",
    player_visible_to: [],
    ai_provenance: null,
    role: null,
    status: null,
    ...over,
  };
}

describe("groupConnections", () => {
  it("orders groups people, factions, places, deities, items, quests and hides the empty ones", () => {
    const rows = [
      conn({ row_id: "1", other_kind: "item", other_id: "i1" }),
      conn({ row_id: "2", other_kind: "npc", other_id: "n1" }),
      conn({ row_id: "3", other_kind: "party_member", other_id: "p1" }),
      conn({ row_id: "4", other_kind: "faction", other_id: "f1" }),
      conn({ row_id: "5", other_kind: "quest", other_id: "q1", source: "quest" }),
    ];
    const groups = groupConnections({ kind: "npc", id: "me" }, rows);
    expect(groups.map((g) => g.group)).toEqual(["people", "factions", "items", "quests"]);
    expect(groups[0]?.entries).toHaveLength(2);
  });

  it("folds a place's many residents into one line that points at People in the Area", () => {
    const residents = Array.from({ length: COLLAPSE_AT + 1 }, (_, i) =>
      conn({ source: "npc_home", row_id: `n${i}`, other_id: `n${i}`, type: "lives_in", outward: false }),
    );
    const guard = conn({ row_id: "g", other_id: "g1", type: "guards", outward: false });
    const [people] = groupConnections({ kind: "location", id: "L" }, [...residents, guard]);
    expect(people?.entries).toHaveLength(2);
    expect(people?.entries[0]).toMatchObject({ kind: "summary", text: `${COLLAPSE_AT + 1} people live here`, points: "People in the Area" });
    expect(people?.entries[1]).toMatchObject({ kind: "row" });
  });

  it("keeps a short list of residents as rows", () => {
    const residents = Array.from({ length: COLLAPSE_AT }, (_, i) => conn({ source: "npc_home", row_id: `n${i}`, other_id: `n${i}`, type: "lives_in", outward: false }));
    const [people] = groupConnections({ kind: "location", id: "L" }, residents);
    expect(people?.entries.every((e) => e.kind === "row")).toBe(true);
  });

  it("folds a long roster into a members line that counts the party", () => {
    const members = [
      ...Array.from({ length: COLLAPSE_AT }, (_, i) => conn({ source: "membership", row_id: `m${i}`, other_id: `n${i}`, type: "member_of", outward: false })),
      conn({ source: "membership", row_id: "pc", other_kind: "party_member", other_id: "p1", type: "member_of", outward: false }),
    ];
    const [people] = groupConnections({ kind: "faction", id: "F" }, members);
    expect(people?.entries).toEqual([
      expect.objectContaining({ kind: "summary", text: `${COLLAPSE_AT + 1} members, 1 of the party`, points: "Members" }),
    ]);
  });
});

describe("membership roles", () => {
  it("does not offer the head roles to a faction that already has a head", () => {
    expect(offeredRoles(true)).not.toContain("Leader");
    expect(offeredRoles(true)).not.toContain("Head of house");
    expect(offeredRoles(false)).toContain("Leader");
  });

  it("keeps the head role on the member who holds it", () => {
    expect(offeredRoles(true, "Leader")).toContain("Leader");
  });

  it("finds the faction and the person whichever end the sheet is", () => {
    const row = conn({ source: "membership", other_kind: "faction", other_id: "f1", type: "member_of" });
    expect(membershipEnds(row, { kind: "npc", id: "n1" })).toEqual({ factionId: "f1", personKind: "npc", personId: "n1" });
    const roster = conn({ source: "membership", other_kind: "party_member", other_id: "p1", type: "member_of", outward: false });
    expect(membershipEnds(roster, { kind: "faction", id: "f1" })).toEqual({ factionId: "f1", personKind: "party_member", personId: "p1" });
    expect(membershipEnds(conn({}), { kind: "npc", id: "n1" })).toBeNull();
  });
});

describe("homeRoute", () => {
  it("opens the faction a membership belongs to, and nothing when the sheet is that faction", () => {
    const row = conn({ source: "membership", other_kind: "faction", other_id: "f1", type: "member_of" });
    expect(homeRoute(row, { kind: "npc", id: "n1" })).toBe("/factions/f1");
    expect(homeRoute(row, { kind: "faction", id: "f1" })).toBeNull();
  });

  it("has no home page for a link", () => {
    expect(homeRoute(conn({}), { kind: "npc", id: "n1" })).toBeNull();
  });
});

describe("type choices", () => {
  it("splits common types from the rest", () => {
    const { common, more } = splitChoices(typeChoices("npc", "npc"));
    expect(common.map((c) => c.key)).toContain("friend");
    expect(more.map((c) => c.key)).toContain("chosen_family");
    expect(common.some((c) => !c.common)).toBe(false);
  });

  it("reads the same tie from the other sheet", () => {
    const owes = typeChoices("npc", "npc").find((c) => c.key === "creditor_of" && !c.subjectIsFrom);
    expect(owes?.word).toBe("owes");
    expect(oppositeWord("npc", "npc", owes!)).toBe("creditor of");
  });

  it("maps a kin choice to the Add relative relation", () => {
    expect(kinRelationFor({ key: "parent_of", subjectIsFrom: true })).toBe("parent");
    expect(kinRelationFor({ key: "parent_of", subjectIsFrom: false })).toBe("child");
    expect(kinRelationFor({ key: "sibling_of", subjectIsFrom: true })).toBe("sibling");
    expect(() => kinRelationFor({ key: "friend", subjectIsFrom: true })).toThrow();
  });
});
