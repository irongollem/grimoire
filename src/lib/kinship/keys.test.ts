import { describe, expect, it } from "vitest";
import { endColumns, kinInsertFor, linkEnds, parsePersonKey, personKey } from "./keys";

describe("person keys", () => {
  it("round-trips an NPC and a PC", () => {
    expect(parsePersonKey(personKey("npc", "a"))).toEqual({ type: "npc", id: "a" });
    expect(parsePersonKey(personKey("pc", "b"))).toEqual({ type: "pc", id: "b" });
  });

  it("reads and writes the four end columns", () => {
    const cols = endColumns("npc:a", "pc:b");
    expect(cols).toEqual({ from_npc_id: "a", from_party_member_id: null, to_npc_id: null, to_party_member_id: "b" });
    expect(linkEnds(cols)).toEqual({ from: "npc:a", to: "pc:b" });
  });
});

describe("kinInsertFor", () => {
  it("stores a child as the parent link the other way round", () => {
    const row = kinInsertFor("npc:wren", "child", "npc:brenna", { parent_role: "mother" });
    expect(linkEnds(row)).toEqual({ from: "npc:brenna", to: "npc:wren" });
    expect(row).toMatchObject({ kind: "parent", parent_role: "mother", adoptive: false });
  });

  it("drops parent details from a symmetric link", () => {
    const row = kinInsertFor("npc:a", "spouse", "pc:b", { parent_role: "father", adoptive: true });
    expect(row).toMatchObject({ kind: "spouse", parent_role: null, adoptive: false });
  });

  it("carries an adoptive parent link and the note", () => {
    const row = kinInsertFor("npc:a", "parent", "npc:b", { parent_role: "father", adoptive: true, note: "took him in" });
    expect(linkEnds(row)).toEqual({ from: "npc:a", to: "npc:b" });
    expect(row).toMatchObject({ kind: "parent", parent_role: "father", adoptive: true, note: "took him in" });
  });

  it("keeps the note on a symmetric link too", () => {
    expect(kinInsertFor("npc:a", "sibling", "npc:b", { note: "half" }).note).toBe("half");
  });
});
